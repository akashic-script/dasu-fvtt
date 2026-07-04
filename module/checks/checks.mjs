import { CheckHooks } from './check-hooks.mjs';
import { CheckConfiguration } from './check-configuration.mjs';
import { getPipeline } from '../helpers/pipelines/_module.mjs';
import { DASU, SYSTEM } from '../helpers/config.mjs';
import { Flags } from '../helpers/flags.mjs';
import { renderCheck } from './check-render.mjs';
import { AttributeCheck } from './attribute-check.mjs';
import { SkillCheck } from './skill-check.mjs';
import { AccuracyCheck } from './accuracy-check.mjs';
import { TacticCheck } from './tactic-check.mjs';
import { InitiativeCheck } from './initiative-check.mjs';
import { OpenCheck } from './open-check.mjs';
import { DisplayCheck } from './display-check.mjs';
import { CheckReroll } from './check-reroll.mjs';
import { CheckAid } from './check-aid.mjs';
import { CheckRetarget } from './check-retarget.mjs';
import {
  getActionBlockingStatus,
  isSilenced,
} from '../helpers/status-effects.mjs';

const { DiceTerm } = foundry.dice.terms;

/**
 * @typedef CheckAttributes
 * @property {Attribute} primary
 * @property {Attribute} [secondary]
 */

/* -------------------------------------------- */
/*  Public entry points (one per check type)    */
/* -------------------------------------------- */

/**
 * Raw attribute check: 2d10 + attribute tick vs a GM TN.
 * @param {FUActor} actor
 * @param {CheckAttributes} attributes
 * @param {FUItem} [item]
 * @param {CheckCallback} [configCallback]
 * @param {CheckResultCallback} [onPerform]
 */
const attributeCheck = (actor, attributes, item, configCallback, onPerform) =>
  performCheck(
    {
      type: 'attribute',
      primary: attributes.primary,
      secondary: attributes.secondary,
    },
    actor,
    item,
    configCallback,
    onPerform
  );

/**
 * Skill check: 2d10 + skill tick vs a GM difficulty threshold.
 * @param {FUActor} actor
 * @param {string} skill the skill key
 * @param {FUItem} [item]
 * @param {CheckCallback} [configCallback]
 */
const skillCheck = (actor, skill, item, configCallback) =>
  performCheck({ type: 'skill', skill }, actor, item, configCallback);

/**
 * Combat attack: 2d10 + To Hit vs the target's Avoid.
 * @param {FUActor} actor
 * @param {FUItem} item
 * @param {CheckCallback} [configCallback]
 */
const accuracyCheck = (actor, item, configCallback) =>
  performCheck({ type: 'accuracy' }, actor, item, configCallback);

/**
 * Tactic (Negotiation): 2d10 + stats.land + item.toLand vs the target's Defense.
 * @param {FUActor} actor
 * @param {FUItem} [item]
 * @param {CheckCallback} [configCallback]
 */
const tacticCheck = (actor, item, configCallback) =>
  performCheck({ type: 'tactic' }, actor, item, configCallback);

/**
 * Initiative: 2d10 + DEX (or last-used skill, set via configCallback).
 * @param {FUActor} actor
 * @param {CheckCallback} [configCallback]
 */
const initiativeCheck = (actor, configCallback) =>
  performCheck(
    { type: 'initiative', primary: 'dex' },
    actor,
    undefined,
    configCallback
  );

/**
 * Open check: 2d10 with no tick, vs a GM TN.
 * @param {FUActor} actor
 * @param {CheckCallback} [configCallback]
 */
const openCheck = (actor, configCallback) =>
  performCheck({ type: 'open' }, actor, undefined, configCallback);

const displayCheck = (actor, item, configCallback) =>
  performCheck({ type: 'display' }, actor, item, configCallback);

/* -------------------------------------------- */
/*  Pipeline                                    */
/* -------------------------------------------- */

/**
 * Fires `hook` with a `registerCallback(fn, priority)` registrar, then awaits
 * the registered callbacks in priority order (low to high). This is what lets
 * independent listeners contribute ordered, async behavior to a single phase.
 *
 * @param {string} hook
 * @param {...any} args forwarded to listeners before the registrar
 * @returns {Promise<void>}
 */
async function invokeWithCallbacks(hook, ...args) {
  /** @type {{callback: CheckCallback, priority: number}[]} */
  const callbacks = [];
  const registerCallback = (callback, priority = 0) => {
    callbacks.push({ callback, priority });
  };

  Hooks.callAll(hook, ...args, registerCallback);

  callbacks.sort((a, b) => a.priority - b.priority);
  for (const { callback } of callbacks) {
    await callback(...args);
  }
}

/**
 * Build, seal, and let listeners configure the check before rolling.
 * @param {Partial<Check>} check
 * @param {FUActor} actor
 * @param {FUItem} [item]
 * @param {CheckCallback} [initialConfigCallback]
 * @returns {Promise<Check>}
 */
async function prepareCheck(check, actor, item, initialConfigCallback) {
  check.id ??= foundry.utils.randomID();
  check.primary ??= null;
  check.secondary ??= null;
  check.skill ??= null;
  check.modifiers ??= [];
  check.tick ??= 0;
  check.dice ??= DASU.check.baseDice;
  check.faces ??= DASU.check.faces;
  check.critThreshold ??= DASU.check.defaultCritThreshold;
  check.advantage ??= false;
  check.disadvantage ??= false;
  check.additionalData ??= {};

  // Sealing forbids new top-level keys; listeners extend via additionalData.
  Object.seal(check);

  if (!check.type) throw new Error('check type missing');

  warnIfStatusRestricted(check, actor, item);

  await initialConfigCallback?.(check, actor, item);
  await invokeWithCallbacks(CheckHooks.prepareCheck, check, actor, item);

  applyModifierStacking(check);
  resolveTick(check, actor);

  return check;
}

/**
 * Advisory (non-blocking) notifications when the acting actor is under a status
 * that restricts the action: Stunned/Sleep (cannot act) or Silenced (cannot use
 * abilities). The GM may still proceed; statuses are not hard locks here.
 * @param {Check} check
 * @param {Actor} actor
 * @param {Item} [item]
 */
function warnIfStatusRestricted(check, actor, item) {
  if (!actor) return;
  const blocker = getActionBlockingStatus(actor);
  if (blocker) {
    ui.notifications?.warn(
      game.i18n.format('DASU.Status.CannotAct', {
        name: actor.name,
        status: game.i18n.localize(CONFIG.DASU.statusEffectIndex[blocker].name),
      })
    );
  }
  // Silenced locks abilities (accuracy checks driven by an ability item).
  const usesAbility = item?.type === 'ability';
  if (usesAbility && isSilenced(actor)) {
    ui.notifications?.warn(
      game.i18n.format('DASU.Status.SilencedWarn', { name: actor.name })
    );
  }
}

/**
 * DASU modifier stacking: at most one bonus per named source (the largest),
 * and temporary buff/debuff bonuses are capped at +4 net. Unnamed modifiers
 * (e.g. structural ticks) are left untouched.
 * @param {Check} check
 */
function applyModifierStacking(check) {
  const bySource = new Map();
  const kept = [];
  for (const mod of check.modifiers) {
    if (!mod.source) {
      kept.push(mod);
      continue;
    }
    const current = bySource.get(mod.source);
    if (!current || Math.abs(mod.value) > Math.abs(current.value)) {
      bySource.set(mod.source, mod);
    }
  }
  check.modifiers = [...kept, ...bySource.values()];
}

/**
 * Resolve the structural "Tick" for the check from the actor, if a per-type
 * module hasn't already set it. Attribute/skill ticks come straight from the
 * actor's values.
 * @param {Check} check
 * @param {FUActor} actor
 */
function resolveTick(check, actor) {
  if (check.tick) return;
  const system = actor?.system ?? {};
  if (check.skill) {
    check.tick = system.skills?.[check.skill]?.value ?? 0;
  } else if (check.primary) {
    check.tick = system.attributes?.[check.primary]?.value ?? 0;
  }
}

/* -------------------------------------------- */
/*  Rolling                                     */
/* -------------------------------------------- */

/**
 * Build the dice formula. Base is `Nd{faces}`. Advantage rolls one extra and
 * keeps the highest N; disadvantage keeps the lowest N. They cancel.
 * @param {Check} check
 * @returns {Promise<Roll>}
 */
async function rollCheck(check) {
  const { dice, faces } = check;
  const advantage = check.advantage && !check.disadvantage;
  const disadvantage = check.disadvantage && !check.advantage;

  let dicePart;
  if (advantage) {
    dicePart = `${dice + 1}d${faces}kh${dice}`;
  } else if (disadvantage) {
    dicePart = `${dice + 1}d${faces}kl${dice}`;
  } else {
    dicePart = `${dice}d${faces}`;
  }

  const flat =
    check.tick + check.modifiers.reduce((sum, m) => sum + m.value, 0);
  const flatPart = flat
    ? flat > 0
      ? ` + ${flat}`
      : ` - ${Math.abs(flat)}`
    : '';

  return new Roll(`${dicePart}${flatPart}`).evaluate();
}

/**
 * Extract the kept individual die faces from a rolled check.
 * @param {Roll} roll
 * @returns {number[]}
 */
function extractKeptDice(roll) {
  const diceTerm = roll.terms.find((t) => t instanceof DiceTerm);
  if (!diceTerm) return [];
  return diceTerm.results.filter((r) => r.active).map((r) => r.result);
}

function extractDroppedDice(roll) {
  const diceTerm = roll.terms.find((t) => t instanceof DiceTerm);
  if (!diceTerm) return [];
  return diceTerm.results.filter((r) => !r.active).map((r) => r.result);
}

/**
 * Freeze the result and let listeners react to it.
 * @param {Check} check
 * @param {Roll} roll
 * @param {FUActor} actor
 * @param {FUItem} [item]
 * @param {boolean} [callHook=true]
 * @returns {Promise<Readonly<CheckResult>>}
 */
async function processResult(check, roll, actor, item, callHook = true) {
  if (!roll._evaluated) await roll.evaluate();

  const keptDice = extractKeptDice(roll);
  const droppedDice = extractDroppedDice(roll);
  const critThreshold = Math.max(
    DASU.check.minCritThreshold,
    check.critThreshold ?? DASU.check.defaultCritThreshold
  );

  // Crit: a pair of equal dice both meeting the threshold. Advantage may form
  // the pair from any rolled die so keep-highest can't break it; otherwise only
  // kept dice count. Snake Eyes (pair of 1s) always uses kept dice only.
  const advantage = check.advantage && !check.disadvantage;
  const critDice = advantage ? [...keptDice, ...droppedDice] : keptDice;
  const hasPairAtLeast = (dice, min) =>
    dice.some((d, i) => d >= min && dice.slice(i + 1).some((e) => e === d));
  const critical = hasPairAtLeast(critDice, critThreshold);
  const snakeEyes = keptDice.filter((d) => d === 1).length >= 2;

  const modifierTotal = check.modifiers.reduce((sum, m) => sum + m.value, 0);

  const result = Object.freeze({
    type: check.type,
    id: check.id,
    actorUuid: actor.uuid,
    itemUuid: item?.uuid,
    itemName: item?.name,
    skill: check.skill ?? null,
    primary: check.primary ?? null,
    secondary: check.secondary ?? null,
    roll: roll.toJSON(),
    additionalRolls: [],
    dice: Object.freeze([...keptDice]),
    droppedDice: Object.freeze([...droppedDice]),
    tick: check.tick,
    modifiers: Object.freeze(
      check.modifiers.map((m) => Object.freeze({ ...m }))
    ),
    modifierTotal,
    critThreshold,
    result: roll.total,
    critical,
    snakeEyes,
    additionalData: check.additionalData,
  });

  if (callHook) {
    await invokeWithCallbacks(CheckHooks.processCheck, result, actor, item);
  }

  return result;
}

/* -------------------------------------------- */
/*  Orchestration                               */
/* -------------------------------------------- */

/**
 * Run a check end to end: prepare -> roll -> process -> render.
 * @param {Partial<Check>} check
 * @param {FUActor} actor
 * @param {FUItem} [item]
 * @param {CheckCallback} [prepareCallback]
 * @param {CheckResultCallback} [renderCallback]
 * @returns {Promise<CheckResult>}
 */
const performCheck = async (
  check,
  actor,
  item,
  prepareCallback,
  renderCallback
) => {
  const prepared = await prepareCheck(check, actor, item, prepareCallback);
  const roll = await rollCheck(prepared);
  const result = await processResult(prepared, roll, actor, item);
  await renderCheck(result, actor, item);
  await renderCallback?.(result);
  return result;
};

/**
 * Reconstruct a fresh {@link Check} from a stored result, so it can be
 * re-rolled or re-processed (push, reroll, retarget).
 * @param {CheckResult} result
 * @returns {Check}
 */
const checkFromResult = (result) => ({
  id: foundry.utils.randomID(),
  type: result.type,
  primary: result.primary ?? null,
  secondary: result.secondary ?? null,
  skill: result.skill ?? null,
  modifiers: result.modifiers.map((m) => ({ ...m })),
  tick: result.tick,
  dice: result.dice.length,
  faces: DASU.check.faces,
  critThreshold: result.critThreshold,
  advantage: false,
  disadvantage: false,
  additionalData: { ...result.additionalData },
});

/**
 * Re-process and re-render an existing check message after a modification
 * (push, reroll). The callback may return a new {check, roll}, `false` to
 * abort, or nothing to keep the current configuration.
 * @param {CheckId} checkId
 * @param {(check: CheckResult, actor: FUActor, item: FUItem) => Promise<{check?: Check, roll?: Roll}|boolean|void>} callback
 */
const modifyCheck = async (messageId, callback) => {
  const message = game.messages.get(messageId);
  if (!message) throw new Error('Check to be modified not found.');

  const oldResult = foundry.utils.duplicate(
    message.getFlag(SYSTEM, Flags.ChatMessage.Check)
  );
  const actor = await fromUuid(oldResult.actorUuid);
  const item = oldResult.itemUuid
    ? await fromUuid(oldResult.itemUuid)
    : undefined;

  let outcome = await callback(oldResult, actor, item);
  if (typeof outcome === 'undefined') outcome = true;
  if (!outcome) return;

  const {
    check = checkFromResult(oldResult),
    roll = Roll.fromData(oldResult.roll),
  } = typeof outcome === 'object' ? outcome : {};

  const result = await processResult(check, roll, actor, item, false);
  return renderCheck(result, actor, item, message.flags);
};

/**
 * @type {CheckType[]}
 */
const allRollChecks = [
  'attribute',
  'skill',
  'accuracy',
  'tactic',
  'initiative',
  'open',
  'display',
];

/**
 * Whether a chat message is a check (optionally of a given type).
 * @param {ChatMessage|string} message
 * @param {CheckType|CheckType[]} [type]
 * @returns {boolean}
 */
const isCheck = (message, type = allRollChecks) => {
  if (typeof message === 'string') message = game.messages.get(message);
  if (!(message instanceof ChatMessage)) return false;
  const flag = message.getFlag(SYSTEM, Flags.ChatMessage.Check);
  if (!flag) return false;
  return Array.isArray(type) ? type.includes(flag.type) : type === flag.type;
};

export const Checks = Object.freeze({
  attributeCheck,
  skillCheck,
  accuracyCheck,
  tacticCheck,
  initiativeCheck,
  openCheck,
  displayCheck,
  modifyCheck,
  isCheck,
});

// Expose internals needed by sibling modules (reroll/push reprocess rolls).
export const CheckInternals = Object.freeze({
  processResult,
  rollCheck,
  checkFromResult,
  invokeWithCallbacks,
});

/**
 * Register all bundled check-type listeners. Called once at system init.
 */
export function initializeChecks() {
  AttributeCheck.initialize();
  SkillCheck.initialize();
  AccuracyCheck.initialize();
  TacticCheck.initialize();
  InitiativeCheck.initialize();
  OpenCheck.initialize();
  DisplayCheck.initialize();
  CheckReroll.initialize();
  CheckRetarget.initialize();
  CheckAid.initialize();

  Hooks.on(CheckHooks.renderCheck, (data, result) => {
    const adv = result.advantage && !result.disadvantage;
    const dis = result.disadvantage && !result.advantage;
    if (adv) data.tags.push({ tag: 'DASU.Check.Advantage' });
    else if (dis) data.tags.push({ tag: 'DASU.Check.Disadvantage' });
  });

  // Registered at high priority so it runs last in the prepare phase.
  Hooks.on(CheckHooks.prepareCheck, (check, actor, item, registerCallback) => {
    const overrides = check.additionalData?.dialogOverrides;
    if (!overrides) return;
    registerCallback(() => {
      const config = CheckConfiguration.configure(check);
      if (overrides.range) config.setRange(overrides.range);
      if (overrides.damageType) config.setDamageType(overrides.damageType);
      if (overrides.damageValue != null)
        config.setDamageValue(overrides.damageValue);
      if (overrides.cost) config.setCost(overrides.cost);
      if (overrides.resistanceModes)
        config.setResistanceModes(overrides.resistanceModes);
      if (overrides.healValue != null)
        check.additionalData.healValue = overrides.healValue;
      if (overrides.schemaLevel != null)
        check.additionalData.schemaLevel = overrides.schemaLevel;
      delete check.additionalData.dialogOverrides;
    }, 1000);
  });

  Hooks.on(CheckHooks.renderCheck, (data, result, actor, item) => {
    if (!item) return;
    const sys = item.system ?? {};
    const inspector = CheckConfiguration.inspect(result);

    result.additionalData.itemType = item.type;
    if (sys.category) result.additionalData.itemCategory = sys.category;
    delete result.additionalData.pipelineActions;

    const pipelineActions = [];

    // Effect apply action, labeled "Apply {name}" when the effect resolves.
    const effectAction = (effectUuid, name) => ({
      type: 'effect',
      label: name
        ? game.i18n.format('DASU.Pipeline.ApplyEffectNamed', { name })
        : game.i18n.localize('DASU.Pipeline.ApplyEffect'),
      effectName: name ?? null,
      icon: 'fas fa-hand-sparkles',
      // sourceActorUuid lets a granted status snapshot the caster's attributes
      // (Bleeding/Infected scale with the caster's tick, not the target's).
      input: { effectUuid, sourceActorUuid: result.actorUuid },
    });

    const categoryMap =
      item.type === 'weapon'
        ? DASU.weaponCategories
        : item.type === 'ability'
        ? DASU.abilityCategories
        : null;
    if (categoryMap && sys.category && categoryMap[sys.category]) {
      data.tags.push({ tag: categoryMap[sys.category] });
    }

    const range = inspector.getRange() ?? sys.range;
    if (item.type === 'weapon' && range && DASU.weaponRanges[range]) {
      data.tags.push({ tag: DASU.weaponRanges[range] });
    }

    if (item.type === 'ability' && sys.aptitude?.type) {
      const aptLabel = DASU.aptitudes[sys.aptitude.type];
      if (aptLabel) {
        data.tags.push({
          tag: aptLabel,
          value: sys.aptitude.value != null ? String(sys.aptitude.value) : null,
        });
      }
    }

    // Schemas store cost per level under system.level{N}.resource; the dialog
    // records which level was chosen in additionalData.schemaLevel.
    const schemaLevel = result.additionalData?.schemaLevel ?? sys.level ?? 1;
    const baseResource =
      item.type === 'schema'
        ? sys[`level${schemaLevel}`]?.resource
        : sys.resource;
    const costOverride = inspector.getCost();
    const cost = costOverride ? costOverride.value : baseResource?.cost;
    const resType = costOverride?.type ?? baseResource?.type;
    const costNum = parseInt(cost);
    if (Number.isFinite(costNum) && costNum > 0 && resType) {
      const resAbbr = DASU.resourceAbbreviations[resType] ?? resType;
      data.tags.push({
        tag: 'DASU.Check.Cost',
        value: `${costNum} ${game.i18n.localize(resAbbr)}`,
      });
      // Cost is paid by the speaker, so pin its apply to the source actor.
      if (resType === 'hp' || resType === 'wp') {
        pipelineActions.push({
          type: 'resource',
          label: 'DASU.Pipeline.ApplyResource',
          icon: 'fas fa-fire-flame-curved',
          uuid: result.actorUuid,
          input: {
            resource: resType,
            value: costNum,
            op: 'cost',
          },
        });
      }
    }

    if (item.type === 'ability' && sys.category === 'restorative' && sys.heal) {
      const h = sys.heal;
      const healValue = result.additionalData?.healValue ?? h.value ?? 0;
      if (healValue > 0) {
        const healRes = game.i18n.localize(
          DASU.abilityHealResources?.[h.resource] ?? h.resource ?? ''
        );
        let valueStr;
        if (h.mode === 'tick') {
          const attr = game.i18n
            .localize(DASU.attributeAbbreviations?.[h.attribute] ?? '')
            .toUpperCase();
          valueStr = `${attr}+${healValue}`;
        } else {
          const suffix = h.mode === 'percent' ? '%' : '';
          valueStr = `${healValue}${suffix}`;
        }
        data.tags.push({
          tag: 'DASU.Check.Heal',
          value: `${valueStr} ${healRes}`.trim(),
        });
        // Tick heals depend on the target's attribute and are resolved at apply
        // time; only flat/percent heals can be applied via a simple pipeline.
        if (h.mode !== 'tick' && (h.resource === 'hp' || h.resource === 'wp')) {
          // Caster's outgoing-recovery tuning adds to flat heals (percent is
          // relative to the target's max, so it isn't adjusted here).
          const outgoing =
            h.mode === 'percent'
              ? 0
              : actor?.system?.bonuses?.outgoingRecovery?.[h.resource] ?? 0;
          pipelineActions.push({
            type: 'resource',
            label: 'DASU.Pipeline.ApplyHeal',
            icon: 'fas fa-heart',
            input: {
              resource: h.resource,
              value: Math.max(0, healValue + outgoing),
              op: 'heal',
              mode: h.mode === 'percent' ? 'percent' : 'flat',
            },
          });
        }
      }
    }

    if (item.type === 'item' && Array.isArray(sys.effects)) {
      for (const effect of sys.effects) {
        if (effect.resource === 'damage') {
          if (!(effect.value > 0)) continue;
          const elem = game.i18n.localize(
            DASU.damageTypes[effect.damageType] ?? effect.damageType ?? ''
          );
          data.tags.push({
            tag: 'DASU.Item.Item.ResourceDamage',
            value: `${effect.value} ${elem}`.trim(),
          });
          pipelineActions.push({
            type: 'damage',
            label: 'DASU.Pipeline.ApplyDamage',
            icon: 'fas fa-burst',
            input: {
              value: effect.value,
              damageType: effect.damageType ?? 'physical',
              resource: 'hp',
            },
          });
        } else if (effect.resource === 'hp' || effect.resource === 'wp') {
          if (!(effect.value > 0)) continue;
          const res = game.i18n.localize(
            DASU.itemResources[effect.resource] ?? effect.resource ?? ''
          );
          const suffix = effect.mode === 'percent' ? '%' : '';
          data.tags.push({
            tag: 'DASU.Check.Heal',
            value: `${effect.value}${suffix} ${res}`.trim(),
          });
          pipelineActions.push({
            type: 'resource',
            label: 'DASU.Pipeline.ApplyHeal',
            icon: 'fas fa-heart',
            input: {
              resource: effect.resource,
              value: effect.value,
              op: 'heal',
              mode: effect.mode === 'percent' ? 'percent' : 'flat',
            },
          });
        } else if (
          effect.resource === 'status' &&
          effect.statusMode === 'grant' &&
          effect.grantUuid
        ) {
          // A granted status applies an Active Effect to the target.
          const granted = fromUuidSync(effect.grantUuid);
          if (granted) {
            data.tags.push({
              tag: 'DASU.Pipeline.ApplyEffect',
              value: granted.name,
            });
          }
          pipelineActions.push(effectAction(effect.grantUuid, granted?.name));
        }
      }
    }

    // Abilities, weapons, and tactics apply their "Apply Effects" entries
    // (flagged dasu.applied) to hit targets; an effect flagged
    // apply-target=self goes to the caster.
    if (DASU.taggableTypes?.includes(item.type)) {
      for (const effect of item.effects ?? []) {
        if (!effect.flags?.dasu?.applied) continue;
        const isSelf = effect.flags?.dasu?.applyTarget === 'self';
        const dcThreshold = effect.flags?.dasu?.dcThreshold ?? null;
        const action = effectAction(effect.uuid, effect.name);
        if (isSelf) action.uuid = result.actorUuid;
        if (dcThreshold != null) {
          action.input.dcThreshold = dcThreshold;
          action.input.rollTotal = result.result;
        }
        pipelineActions.push(action);
        data.tags.push({
          tag: 'DASU.Pipeline.ApplyEffect',
          value: dcThreshold != null
            ? game.i18n.format('DASU.Pipeline.ApplyEffectDC', { name: effect.name, dc: dcThreshold > 0 ? `+${dcThreshold}` : dcThreshold })
            : effect.name,
        });
      }
    }

    // Bonds grant the chosen rank's Active Effect (rank picked in the dialog,
    // stashed as additionalData.bondRank).
    if (item.type === 'bond') {
      const rankKey = result.additionalData?.bondRank;
      const effectUuid = rankKey ? sys[rankKey]?.effectUuid : null;
      if (effectUuid) {
        const granted = fromUuidSync(effectUuid);
        if (granted) {
          data.tags.push({
            tag: 'DASU.Pipeline.ApplyEffect',
            value: granted.name,
          });
        }
        pipelineActions.push(effectAction(effectUuid, granted?.name));
      }
    }

    const RESIST_MODE_TAG = {
      resist: 'DASU.Check.IgnoreResist',
      nullify: 'DASU.Check.IgnoreNullify',
      drain: 'DASU.Check.IgnoreDrain',
      weak: 'DASU.Check.IgnoreWeak',
    };
    const ignore = inspector.getResistanceModes() ?? [];
    for (const mode of ignore) {
      const tagKey = RESIST_MODE_TAG[mode];
      if (tagKey) data.tags.push({ tag: tagKey });
    }

    // Weapon/ability damage from inspector goes into pipelineActions if not
    // already covered by a more specific action (e.g. item.type === 'item').
    const inspectorDamage = inspector.getDamage();
    const hasDamageAction = pipelineActions.some((a) => a.type === 'damage');
    if (inspectorDamage?.amount > 0 && !hasDamageAction) {
      const dmgBonuses = actor?.system?.bonuses?.damage;
      const vsArchetypeBonuses = dmgBonuses ? {
        hero: dmgBonuses.hero ?? 0,
        sage: dmgBonuses.sage ?? 0,
        rogue: dmgBonuses.rogue ?? 0,
        trickster: dmgBonuses.trickster ?? 0,
      } : undefined;
      pipelineActions.push({
        type: 'damage',
        label: game.i18n.localize('DASU.Pipeline.ApplyDamage'),
        icon: 'fas fa-burst',
        input: {
          value: inspectorDamage.amount,
          damageType: inspectorDamage.type ?? 'physical',
          resource: 'hp',
          ignore: ignore.length ? [...ignore] : undefined,
          vsArchetypeBonuses,
        },
      });
    }

    // Carry ignored-resistance modes onto existing damage actions.
    if (ignore.length) {
      for (const action of pipelineActions) {
        if (action.type === 'damage') action.input.ignore = [...ignore];
      }
    }
    if (pipelineActions.length) {
      result.additionalData.pipelineActions = pipelineActions;
    }

    // Slotted tags, injected at the end of the tag row as plain-name chips.
    if (sys.tags) {
      for (const tag of sys.tags) {
        if (tag.name) data.tags.push({ tag: tag.name, slottedTag: true });
      }
    }

    // Annotate each target with DC info for DC-gated effect actions.
    const dcActions = pipelineActions.filter(
      (a) => a.type === 'effect' && a.input.dcThreshold != null && a.input.rollTotal != null
    );
    if (dcActions.length) {
      const rollTotal = result.result;
      for (const target of result.additionalData.targets ?? []) {
        const targetDoc = fromUuidSync(target.uuid);
        const targetActor = targetDoc?.actor ?? (targetDoc instanceof Actor ? targetDoc : null);
        const avoid = targetActor?.system?.stats?.avoid?.value ?? target.tn ?? 0;
        target.dcInfo = dcActions.map((a) => ({
          name: a.effectName,
          effectiveDC: avoid + a.input.dcThreshold,
          rollTotal,
          passed: rollTotal >= avoid + a.input.dcThreshold,
        }));
        target.dcPartial = target.hit && target.dcInfo.some((d) => !d.passed);
        target.dcAllFailed = target.hit && target.dcInfo.every((d) => !d.passed);
      }
    }
  });

  Hooks.on('renderChatMessageHTML', async (message, html) => {
    const result = message.getFlag(SYSTEM, Flags.ChatMessage.Check);
    if (!result) return;
    html.classList.add(
      'dasu-check-message',
      `dasu-check-message--${result.type}`
    );

    const itemType = result.additionalData?.itemType;
    const itemCategory = result.additionalData?.itemCategory;
    if (itemType === 'ability' && itemCategory) {
      html.classList.add(`dasu-check-message--ability-${itemCategory}`);
    }

    const fieldsetHeader = html.querySelector('.dasu-fieldset__header');
    if (!fieldsetHeader) return;

    const itemUuid = message.getFlag(SYSTEM, Flags.ChatMessage.Item);
    const item = itemUuid ? await fromUuid(itemUuid) : null;
    const src = result.additionalData?.resistanceImg ?? item?.img ?? message.speakerActor?.img;
    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.classList.add('check-card-avatar');
      const target = item ?? message.speakerActor;
      if (target?.isOwner) {
        img.style.cursor = 'pointer';
        img.addEventListener('click', () => target.sheet?.render(true));
      }
      fieldsetHeader.prepend(img);
    }

    // Clicking a target's name opens its sheet, if the user can view it.
    for (const nameEl of html.querySelectorAll('.target-name[data-uuid]')) {
      const uuid = nameEl.dataset.uuid;
      if (!uuid) continue;
      const doc = await fromUuid(uuid);
      // Token uuids resolve to a TokenDocument; open its actor sheet.
      const actor = doc?.actor ?? doc;
      const sheet = actor?.sheet;
      if (!sheet || !actor.testUserPermission?.(game.user, 'LIMITED')) continue;
      nameEl.style.cursor = 'pointer';
      nameEl.addEventListener('click', () => sheet.render(true));
    }

    // Per-target context menu: one entry per target-applicable pipeline action.
    const targetActions = (result.additionalData?.pipelineActions ?? []).filter(
      (a) => !a.uuid && (a.type === 'damage' || a.type === 'effect')
    );
    if (targetActions.length) {
      const menuSource = {
        actorUuid: result.actorUuid,
        name: result.itemName ?? message.speaker?.alias,
      };
      for (const menuBtn of html.querySelectorAll('.target-apply-menu')) {
        menuBtn.style.display = '';
        const targetUuid = menuBtn.dataset.targetUuid;
        const isHit = menuBtn.dataset.targetHit === '1';
        // Both hit and miss offer every target action; on a miss they are framed
        // as an "(override)" so the GM can force damage/effects to land anyway.
        if (!targetActions.length) {
          menuBtn.style.display = 'none';
          continue;
        }
        menuBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          document.querySelectorAll('.target-apply-context-menu').forEach((m) => m.remove());
          const menu = document.createElement('div');
          menu.classList.add('target-apply-context-menu');
          for (const action of targetActions) {
            const pipeline = getPipeline(action.type);
            if (!pipeline) continue;
            const entry = document.createElement('button');
            entry.type = 'button';
            // On a miss, relabel as an override per action type.
            const dcBlocked = action.type === 'effect'
              && action.input.dcThreshold != null
              && action.input.rollTotal != null
              && (() => {
                const doc = fromUuidSync(targetUuid);
                const targetActor = doc?.actor ?? (doc instanceof Actor ? doc : null);
                const avoid = targetActor?.system?.stats?.avoid?.value ?? 0;
                return action.input.rollTotal < avoid + action.input.dcThreshold;
              })();
            const label = (isHit && !dcBlocked)
              ? game.i18n.localize(action.label) || action.label
              : action.type === 'damage'
                ? game.i18n.localize('DASU.Pipeline.ApplyDamageOverride')
                : game.i18n.format('DASU.Pipeline.ApplyEffectOverride', {
                    name: action.effectName ?? game.i18n.localize('DASU.Pipeline.ApplyEffect'),
                  });
            entry.innerHTML = `<i class="${action.icon}"></i> ${label}`;
            entry.addEventListener('click', (ev) => {
              ev.stopPropagation();
              menu.remove();
              pipeline.applyToTargets(action.input, menuSource, { uuid: targetUuid });
            });
            menu.append(entry);
          }
          const rect = menuBtn.getBoundingClientRect();
          menu.style.position = 'fixed';
          menu.style.top = `${rect.bottom + 2}px`;
          menu.style.right = `${window.innerWidth - rect.right}px`;
          menu.style.left = 'auto';
          document.body.append(menu);
          const dismiss = (ev) => {
            if (!menu.contains(ev.target)) {
              menu.remove();
              document.removeEventListener('click', dismiss, true);
            }
          };
          setTimeout(() => document.addEventListener('click', dismiss, true), 0);
        });
      }
    } else {
      for (const menuBtn of html.querySelectorAll('.target-apply-menu')) {
        menuBtn.style.display = 'none';
      }
    }

    // Resource cost is now an undoable pipeline action (PipelineButton.inject),
    // replacing the former one-shot deduct button.

    // Footer
    const footer = document.createElement('div');
    footer.classList.add('check-card__footer');

    const speakerName = message.speaker?.alias ?? message.speakerActor?.name;
    if (speakerName) {
      const speakerEl = document.createElement('span');
      speakerEl.classList.add('check-card__footer-speaker');
      speakerEl.textContent = speakerName;
      footer.append(speakerEl);
    }

    const meta = document.createElement('span');
    meta.classList.add('check-card__footer-meta');
    const timestamp = html.querySelector('.message-timestamp');
    if (timestamp) {
      timestamp.classList.add('check-card-timestamp');
      meta.append(timestamp);
    }
    const deleteBtn = html.querySelector('.message-delete');
    if (deleteBtn) meta.append(deleteBtn);
    footer.append(meta);

    html.querySelector('.check-card__fieldset')?.append(footer);

  });
}
