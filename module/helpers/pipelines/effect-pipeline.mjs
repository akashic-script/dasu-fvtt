import { Pipeline } from './pipeline.mjs';
import { SYSTEM } from '../config.mjs';
import {
  applyStatus,
  isStackable,
  statusIdOf,
  stacksOf,
  resyncStacks,
} from '../status-effects.mjs';

/**
 * Grant an Active Effect to the target. Revert deletes it; redo creates a fresh
 * effect with a new id (asymmetric vs the damage/resource pipelines).
 */
export class EffectPipeline extends Pipeline {
  static type = 'effect';

  computeOutcome(input, target) {
    let effectData = input.effectData ?? null;
    let src = null;
    if (input.effectUuid) {
      src = fromUuidSync(input.effectUuid);
      if (src) {
        effectData =
          typeof src.toObject === 'function'
            ? src.toObject()
            : foundry.utils.deepClone(src._source ?? src);
      }
    }
    const description =
      src?.system?.description ??
      effectData?.system?.description ??
      effectData?.description ??
      '';

    // Strip the source _id so repeated applies don't collide on one embedded id.
    if (effectData) delete effectData._id;

    if (effectData) normalizeDuration(effectData);

    const statusId =
      effectData?.flags?.dasu?.statusId ?? effectData?.statuses?.[0] ?? null;
    const isKnownStatus = !!(
      statusId && CONFIG.DASU.statusEffectIndex?.[statusId]
    );

    // Snapshot the caster's attributes for caster-scaled statuses (Bleeding/
    // Infected, stack caps) so later turns don't depend on the caster existing.
    let statusSource = null;
    if (isKnownStatus && input.sourceActorUuid) {
      const caster = fromUuidSync(input.sourceActorUuid);
      const attrs = caster?.system?.attributes;
      if (attrs) {
        statusSource = {
          uuid: input.sourceActorUuid,
          attributes: Object.fromEntries(
            Object.entries(attrs).map(([k, v]) => [k, v?.value ?? 0])
          ),
        };
        if (effectData) {
          effectData.flags = effectData.flags ?? {};
          effectData.flags.dasu = { ...effectData.flags.dasu, statusSource };
        }
      }
    }

    const dcThreshold = input.dcThreshold ?? null;
    const rollTotal = input.rollTotal ?? null;
    let dcSkipped = false;
    let effectiveDC = null;
    if (dcThreshold != null && rollTotal != null) {
      const baseTN = target?.system?.stats?.avoid?.value ?? 0;
      effectiveDC = baseTN + dcThreshold;
      dcSkipped = rollTotal < effectiveDC;
    }

    return {
      sourceUuid: input.effectUuid ?? null,
      effectData,
      statusId: isKnownStatus ? statusId : null,
      statusSource,
      name: effectData?.name ?? game.i18n.localize('DASU.Pipeline.ApplyEffect'),
      img: effectData?.img ?? 'icons/svg/aura.svg',
      description,
      dcThreshold,
      rollTotal,
      effectiveDC,
      dcSkipped,
    };
  }

  async applyToTarget(outcome, target) {
    if (outcome.dcSkipped) return { dcSkipped: true };
    if (!outcome.effectData)
      throw new Error('EffectPipeline: no effect data to apply');

    // Statuses route through applyStatus for stacking; capture prior for revert.
    if (outcome.statusId) {
      const prior = target.effects.find(
        (e) => statusIdOf(e) === outcome.statusId
      );
      const priorStacks = prior ? stacksOf(prior) : 0;
      const effect = await applyStatus(target, outcome.statusId, {
        source: outcome.statusSource ?? undefined,
      });
      return {
        effectId: effect?.id ?? null,
        statusId: outcome.statusId,
        existedBefore: !!prior,
        priorStacks,
      };
    }

    const [created] = await target.createEmbeddedDocuments('ActiveEffect', [
      outcome.effectData,
    ]);
    return { effectId: created?.id ?? null };
  }

  async revert(revertData, target) {
    if (revertData?.dcSkipped) return;
    const id = revertData?.effectId;
    if (!id || !target.effects?.get(id)) return;

    // If a stackable status pre-existed, restore its prior stacks; else delete.
    if (revertData.statusId && isStackable(revertData.statusId)) {
      const effect = target.effects.get(id);
      if (revertData.existedBefore && revertData.priorStacks > 0) {
        await effect.update({
          [`flags.${SYSTEM}.stacks`]: revertData.priorStacks,
        });
        await resyncStacks(effect);
        return;
      }
    }
    await target.deleteEmbeddedDocuments('ActiveEffect', [id]);
  }

  get resultTemplate() {
    return `systems/${SYSTEM}/templates/chat/pipeline/body-effect.hbs`;
  }

  async getMessageData(state) {
    const c = state.computed;
    const description = c.description
      ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(
          c.description,
          { secrets: false }
        )
      : '';
    const rawDur = c.effectData?.duration ?? {};
    const duration = _formatDuration(rawDur);
    return {
      name: c.name,
      description,
      duration,
      dcSkipped: c.dcSkipped ?? false,
      effectiveDC: c.effectiveDC ?? null,
      rollTotal: c.rollTotal ?? null,
    };
  }
}

function normalizeDuration(effectData) {
  const dur = effectData.duration;
  if (!dur || !dur.value || !dur.units) return;
  const n = Number(dur.value);
  if (!Number.isFinite(n) || n <= 0) return;
  effectData.duration = {
    ...dur,
    rounds: dur.units === 'rounds' ? n : null,
    turns: dur.units === 'turns' ? n : null,
    value: undefined,
    units: undefined,
  };
}

function _formatDuration(dur) {
  if (!dur) return null;
  const rounds = dur.rounds ?? (dur.units === 'rounds' ? dur.value : null);
  const turns = dur.turns ?? (dur.units === 'turns' ? dur.value : null);
  if (rounds)
    return game.i18n.format('DASU.Pipeline.DurationRounds', { n: rounds });
  if (turns)
    return game.i18n.format('DASU.Pipeline.DurationTurns', { n: turns });
  return null;
}
