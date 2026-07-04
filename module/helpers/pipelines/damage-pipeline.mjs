import { Pipeline } from './pipeline.mjs';
import { SYSTEM } from '../config.mjs';
import { isUnraveled, wakeIfSleeping } from '../status-effects.mjs';
import { sumDamageBonus } from '../../data/bonuses.mjs';

// Resistance level (-1..3) -> { mode, multiplier }. x0.5 rounds down; drain
// flips damage into healing (applied to the target only).
const RESIST = {
  '-1': { mode: 'weak', multiplier: 2 },
  0: { mode: 'normal', multiplier: 1 },
  1: { mode: 'resist', multiplier: 0.5 },
  2: { mode: 'nullify', multiplier: 0 },
  3: { mode: 'drain', multiplier: -1 },
};

/**
 * Reduce a target resource by a resistance-adjusted amount. A `drain`
 * resistance heals the target instead. The check may pass `input.ignore` (modes
 * to treat as normal) from its resistance-mode overrides.
 */
export class DamagePipeline extends Pipeline {
  static type = 'damage';

  computeOutcome(input, target) {
    const resource = input.resource === 'wp' ? 'wp' : 'hp';
    const damageType = input.damageType ?? 'physical';
    const pool = target.system?.resources?.[resource] ?? {};
    const max = pool.max ?? 0;
    const priorValue = pool.value ?? 0;

    let level = target.system?.resistances?.[damageType]?.base ?? 0;
    // Unraveled: weak to all damage types. Only worsens resistance, never
    // overriding an even weaker (already negative) value.
    if (isUnraveled(target)) level = Math.min(level, -1);
    let { mode, multiplier } = RESIST[String(level)] ?? RESIST['0'];
    // An ignored mode is treated as a normal hit.
    if (input.ignore?.includes(mode)) {
      mode = 'normal';
      multiplier = 1;
    }

    // Incoming-damage tuning (blanket + per-type) adjusts the raw amount before
    // the resistance multiplier. Positive = takes more; clamped at 0.
    const incoming = sumDamageBonus(target.system?.bonuses?.incomingDamage, {
      type: damageType,
    });
    const vsArchetype = target.itemTypes?.archetype?.[0]?.system?.dsid;
    const vsBonus = vsArchetype
      ? input.vsArchetypeBonuses?.[vsArchetype] ?? 0
      : 0;
    const raw = Math.max(0, (input.value ?? 0) + incoming + vsBonus);
    const finalAmount = Math.floor(raw * Math.abs(multiplier));
    const drain = multiplier < 0;
    const newValue = drain
      ? Math.min(max, priorValue + finalAmount)
      : Math.max(0, priorValue - finalAmount);

    return {
      resource,
      damageType,
      raw,
      level,
      mode,
      drain,
      finalAmount,
      priorValue,
      newValue,
      max,
    };
  }

  async applyToTarget(outcome, target) {
    await target.update({
      [`system.resources.${outcome.resource}.value`]: outcome.newValue,
    });
    // Sleep ends when the sleeper is attacked (took non-drain damage).
    if (!outcome.drain && outcome.finalAmount > 0) await wakeIfSleeping(target);
    return { resource: outcome.resource, priorValue: outcome.priorValue };
  }

  async revert(revertData, target) {
    await target.update({
      [`system.resources.${revertData.resource}.value`]: revertData.priorValue,
    });
  }

  get resultTemplate() {
    return `systems/${SYSTEM}/templates/chat/pipeline/body-damage.hbs`;
  }

  getMessageData(state) {
    const c = state.computed;
    return {
      finalAmount: c.finalAmount,
      damageType: c.damageType,
      damageTypeLabel: game.i18n.localize(
        CONFIG.DASU.damageTypes[c.damageType] ?? c.damageType
      ),
      resourceLabel: game.i18n.localize(
        c.resource === 'wp' ? 'DASU.Resource.WP' : 'DASU.Resource.HP'
      ),
      mode: c.mode,
      modeLabel: game.i18n.localize(
        CONFIG.DASU.resistanceLevels[String(c.level)] ?? ''
      ),
      drain: c.drain,
      isNullify: c.mode === 'nullify',
      priorValue: c.priorValue,
      newValue: c.newValue,
    };
  }
}
