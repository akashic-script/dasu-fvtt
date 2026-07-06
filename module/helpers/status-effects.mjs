import { DASU, SYSTEM } from './config.mjs';

/**
 * Status effect registration and combat automation. Definitions live in
 * {@link DASU.statusEffects}; this module registers them as CONFIG.statusEffects,
 * enforces stacking/Invisible-tier rules on apply, runs per-turn damage, and
 * exposes derived-behavior helpers for the check/damage engine.
 *
 * A status snapshots the caster's attributes at apply time into
 * `flags.dasu.statusSource`, so later turns resolve without the caster existing.
 */

/** Build a CONFIG.statusEffects entry from a DASU.statusEffects definition. */
function toStatusEffectConfig(def) {
  return {
    id: def.id,
    name: def.name,
    img: def.img,
    // changes/flags ride along so toggling on the HUD produces a complete AE.
    changes: def.changes ? foundry.utils.deepClone(def.changes) : [],
    description: def.description,
    flags: foundry.utils.deepClone(def.flags ?? {}),
  };
}

/** Register the system's status effects with Foundry. Call once during init. */
export function registerStatusEffects() {
  CONFIG.statusEffects = DASU.statusEffects.map(toStatusEffectConfig);
  // Our own id -> definition lookup for derived behavior.
  CONFIG.DASU.statusEffectIndex = Object.fromEntries(
    DASU.statusEffects.map((s) => [s.id, s])
  );
}

/** True if a status id may stack. */
export function isStackable(statusId) {
  return statusId in DASU.stackableStatuses;
}

/**
 * Resolve a status's stacking cap against a caster's snapshotted attributes.
 * Non-stackable statuses return 0 (the "does not stack" sentinel); stackable
 * statuses return their literal or attribute-derived maximum (>= 1).
 */
export function resolveStackCap(statusId, sourceAttributes) {
  const cap = DASU.stackableStatuses[statusId];
  if (cap === undefined) return 0; // non-stackable
  if (typeof cap === 'number') return cap;
  // Attribute-keyed cap (e.g. Bleeding -> caster's POW tick).
  return Math.max(1, sourceAttributes?.[cap] ?? 1);
}

/**
 * Resolve a stacking cap from a caster source `{ uuid, attributes }`, preferring
 * the live actor's current tick (by uuid) over the snapshot.
 */
function capFromSource(statusId, source) {
  const cap = DASU.stackableStatuses[statusId];
  if (cap === undefined) return 0;
  if (typeof cap === 'number') return cap;
  const live = source?.uuid
    ? fromUuidSync(source.uuid)?.system?.attributes?.[cap]?.value
    : null;
  if (live != null) return Math.max(1, live);
  return Math.max(1, source?.attributes?.[cap] ?? 1);
}

/** The status id an ActiveEffect represents, if any. */
export function statusIdOf(effect) {
  return (
    effect.statuses?.first?.() ?? effect.getFlag?.(SYSTEM, 'statusId') ?? null
  );
}

/** Find an existing status effect on an actor by status id. */
function findStatus(actor, statusId) {
  return actor.effects.find((e) => statusIdOf(e) === statusId) ?? null;
}

/** Read the current stack count off an effect (absent flag = 1). */
export function stacksOf(effect) {
  return effect?.getFlag?.(SYSTEM, 'stacks') ?? 1;
}

/** The origin (caster) actor of an effect, resolved from its origin UUID. */
function originActorOf(effect) {
  const origin = effect?.origin;
  if (!origin) return null;
  const doc = fromUuidSync(origin);
  if (doc instanceof Actor) return doc;
  // Origin may point at an item/effect owned by the caster.
  return doc?.actor ?? doc?.parent ?? null;
}

/**
 * The effect's max-stack cap. Resolution order: GM `maxStacksOverride`, then the
 * attribute-keyed cap (live from origin, else snapshot), then stored `maxStacks`,
 * then config, then 1.
 * @param {ActiveEffect} effect
 * @returns {number}
 */
export function maxStacksOf(effect) {
  const override = effect?.getFlag?.(SYSTEM, 'maxStacksOverride');
  if (Number.isFinite(override) && override > 0) return override;

  const attrKey = effect?.getFlag?.(SYSTEM, 'maxStacksAttr');
  if (attrKey) {
    const live = originActorOf(effect)?.system?.attributes?.[attrKey]?.value;
    if (live != null) return Math.max(1, live);
    const snap = effect?.getFlag?.(SYSTEM, 'statusSource')?.attributes?.[
      attrKey
    ];
    if (snap != null) return Math.max(1, snap);
  }

  const stored = effect?.getFlag?.(SYSTEM, 'maxStacks');
  if (Number.isFinite(stored) && stored > 0) return stored;

  // Fallback for legacy effects without stored flags.
  return (
    resolveStackCap(
      statusIdOf(effect),
      effect?.getFlag?.(SYSTEM, 'statusSource')?.attributes
    ) || 1
  );
}

/**
 * Apply a status to an actor: the single entry point for the HUD, pipeline, and
 * macros. First apply creates the AE; reapply stacks (toward cap), replaces the
 * weaker Invisible tier, or replaces a non-stackable instance.
 *
 * @param {Actor} actor
 * @param {string} statusId
 * @param {object} [opts]
 * @param {object} [opts.source]  { uuid, attributes } caster snapshot
 * @param {number} [opts.bumpBy]  stacks to add on reapplication (default 1)
 * @param {object} [opts.duration]  Foundry duration to (re)set on apply/reapply
 * @returns {Promise<ActiveEffect|null>}
 */
export async function applyStatus(
  actor,
  statusId,
  { source, bumpBy = 1, duration } = {}
) {
  const def = CONFIG.DASU.statusEffectIndex[statusId];
  if (!actor || !def) return null;

  // Invisible: tiered replacement (stronger wins; weaker is ignored).
  if (def.flags?.dasu?.behavior === 'invisible') {
    const incoming = def.flags.dasu.tier ?? 0;
    const existing = actor.effects.find(
      (e) =>
        CONFIG.DASU.statusEffectIndex[statusIdOf(e)]?.flags?.dasu?.behavior ===
        'invisible'
    );
    if (existing) {
      const current =
        CONFIG.DASU.statusEffectIndex[statusIdOf(existing)]?.flags?.dasu
          ?.tier ?? 0;
      if (incoming <= current) return existing; // keep the stronger/equal tier
      await existing.delete();
    }
    return createStatus(actor, statusId, { source, duration });
  }

  const existing = findStatus(actor, statusId);
  if (!existing) return createStatus(actor, statusId, { source, duration });

  if (isStackable(statusId)) {
    const update = {};
    if (source?.uuid) {
      update.origin = source.uuid;
      update[`flags.${SYSTEM}.statusSource`] = source;
    }
    if (duration) update.duration = duration;
    const override = existing.getFlag(SYSTEM, 'maxStacksOverride');
    const cap =
      Number.isFinite(override) && override > 0
        ? override
        : source
        ? capFromSource(statusId, source)
        : maxStacksOf(existing);
    const next = Math.min(cap, stacksOf(existing) + bumpBy);
    update[`flags.${SYSTEM}.stacks`] = next;
    update.name = stackedName(baseNameOf(existing), next);
    update.changes = scaledChanges(statusId, next, scaleWithStacksOf(existing));
    await existing.update(update);
    return existing;
  }

  await existing.delete();
  return createStatus(actor, statusId, { source, duration });
}

/** Create a fresh status AE from its CONFIG definition (stack = 1). */
async function createStatus(actor, statusId, { source, duration } = {}) {
  const def = CONFIG.DASU.statusEffectIndex[statusId];
  // Store the cap (and its attribute key, if any) so the effect is self-contained.
  const rawCap = DASU.stackableStatuses[statusId];
  const maxStacks = resolveStackCap(statusId, source?.attributes);
  const stackFlags = isStackable(statusId)
    ? {
        stacks: 1,
        maxStacks,
        ...(typeof rawCap === 'string' ? { maxStacksAttr: rawCap } : {}),
      }
    : {};
  const base = game.i18n.localize(def.name);
  const data = {
    name: base,
    img: def.img,
    statuses: [statusId],
    changes: scaledChanges(statusId, 1),
    description: def.description ? game.i18n.localize(def.description) : '',
    ...(duration ? { duration } : {}),
    // Origin = caster, so attribute-keyed caps resolve live from its tick.
    ...(source?.uuid ? { origin: source.uuid } : {}),
    flags: {
      [SYSTEM]: {
        statusId,
        baseName: base,
        ...stackFlags,
        ...(source ? { statusSource: source } : {}),
      },
    },
  };
  const [created] = await actor.createEmbeddedDocuments('ActiveEffect', [data]);
  return created ?? null;
}

function stackedName(base, stacks) {
  return stacks > 1 ? `${base} (${stacks})` : base;
}

/** The unsuffixed base name of a status effect (stored on create). */
function baseNameOf(effect) {
  return (
    effect?.getFlag?.(SYSTEM, 'baseName') ??
    game.i18n.localize(
      CONFIG.DASU.statusEffectIndex[statusIdOf(effect)]?.name ??
        effect?.name ??
        ''
    )
  );
}

/** Whether an effect's per-stack changes auto-scale (default true). */
export function scaleWithStacksOf(effect) {
  const v = effect?.getFlag?.(SYSTEM, 'scaleWithStacks');
  return v === undefined ? true : !!v;
}

/**
 * Per-stack `changes` (Dazed/Focused/etc.) scaled to a stack count. The base
 * definition stores the single-stack value; we multiply numeric values. When
 * `scale` is false the base (single-stack) values are returned unchanged.
 */
function scaledChanges(statusId, stacks, scale = true) {
  const def = CONFIG.DASU.statusEffectIndex[statusId];
  if (!def?.changes?.length) return [];
  const factor = scale ? stacks : 1;
  return def.changes.map((c) => ({
    ...c,
    value: String(Number(c.value) * factor),
  }));
}

/**
 * Resync an effect's `changes` to its current stack flag, clamping the stack to
 * [1, maxStacks]. Called when a GM edits the stack count on the AE sheet so the
 * value can't be pushed past the cap.
 * @param {ActiveEffect} effect
 */
export async function resyncStacks(effect) {
  const statusId = statusIdOf(effect);
  if (!statusId || !isStackable(statusId)) return;
  const cap = maxStacksOf(effect);
  const clamped = Math.max(1, Math.min(cap, stacksOf(effect)));
  const update = {
    name: stackedName(baseNameOf(effect), clamped),
    changes: scaledChanges(statusId, clamped, scaleWithStacksOf(effect)),
  };
  // Only write the stack flag back if the GM's input was out of range.
  if (clamped !== stacksOf(effect)) update[`flags.${SYSTEM}.stacks`] = clamped;
  await effect.update(update);
}

/** Apply per-turn status damage and reap finished durations at turn start. */
async function onCombatTurn(combat, _prior, current) {
  if (!game.users.activeGM?.isSelf) return; // single executor
  const combatant = current?.combatantId
    ? combat.combatants.get(current.combatantId)
    : combat.combatant;
  const actor = combatant?.actor;
  if (!actor) return;

  for (const effect of actor.effects) {
    const statusId = statusIdOf(effect);
    const behavior =
      CONFIG.DASU.statusEffectIndex[statusId]?.flags?.dasu?.behavior;
    if (behavior !== 'perTurnDamage') continue;

    const stacks = effect.getFlag(SYSTEM, 'stacks') ?? 1;
    const src = effect.getFlag(SYSTEM, 'statusSource');
    const attrKey =
      CONFIG.DASU.statusEffectIndex[statusId].flags.dasu.damageAttr;
    const tick =
      src?.attributes?.[attrKey] ??
      actor.system?.attributes?.[attrKey]?.value ??
      0;
    const amount = tick * stacks;
    if (amount <= 0) continue;

    const hp = actor.system.resources.hp;
    await actor.update({
      'system.resources.hp.value': Math.max(0, (hp.value ?? 0) - amount),
    });
    await announceStatusDamage(actor, statusId, amount, stacks);
  }

  const summary = await reapDurations(actor);
  await postTurnSummary(actor, summary);
}

/** @returns {Promise<{active: object[], expired: object[]}>} */
async function reapDurations(actor) {
  const active = [];
  const expired = [];
  for (const effect of actor.effects ?? []) {
    const d = effect.duration;
    if (!d?.type || d.type === 'none') continue; // no finite combat duration
    const remaining = d.remaining ?? 0;
    if (remaining <= 0) {
      expired.push({ name: effect.name, img: effect.img });
      await effect.delete();
    } else {
      active.push({
        name: effect.name,
        img: effect.img,
        remaining,
        units: d.rounds != null ? 'rounds' : 'turns',
      });
    }
  }
  return { active, expired };
}

async function postTurnSummary(actor, { active, expired }) {
  if (!active.length && !expired.length) return;
  const unitLabel = (units) =>
    game.i18n.localize(
      units === 'turns' ? 'DASU.Duration.Turns' : 'DASU.Duration.Rounds'
    );
  const content = await foundry.applications.handlebars.renderTemplate(
    `systems/${SYSTEM}/templates/chat/turn-summary.hbs`,
    {
      actorName: actor.name,
      actorImg: actor.img ?? 'icons/svg/mystery-man.svg',
      active: active.map((e) => ({
        name: e.name,
        img: e.img,
        remainingLabel: `${e.remaining} ${unitLabel(e.units)}`,
      })),
      expired,
    }
  );
  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: { [SYSTEM]: { messageType: 'turn-summary' } },
  });
}

/** Post a brief chat message for status-tick damage. */
async function announceStatusDamage(actor, statusId, amount, stacks) {
  const label = game.i18n.localize(
    CONFIG.DASU.statusEffectIndex[statusId].name
  );
  const content = game.i18n.format('DASU.Status.TickDamage', {
    name: actor.name,
    status: label,
    amount,
    stacks,
  });
  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: { [SYSTEM]: { messageType: 'status-damage' } },
  });
}

/**
 * Sleep ends when the sleeper is attacked. Call from the damage application
 * path: removes the Sleep status when HP is reduced by an external hit.
 * @param {Actor} actor
 */
export async function wakeIfSleeping(actor) {
  const sleep = actor?.effects?.find((e) => statusIdOf(e) === 'sleep');
  if (sleep) await sleep.delete();
}

/**
 * Whether the actor currently cannot act (Stunned, or Sleep). Used by the check
 * engine to warn before resolving an action.
 * @param {Actor} actor
 * @returns {string|null} the blocking status id, or null
 */
export function getActionBlockingStatus(actor) {
  const blocker = actor?.effects?.find((e) => {
    const b =
      CONFIG.DASU.statusEffectIndex[statusIdOf(e)]?.flags?.dasu?.behavior;
    return b === 'cannotAct';
  });
  return blocker ? statusIdOf(blocker) : null;
}

/** True if the actor is Unraveled (weak to all damage types). */
export function isUnraveled(actor) {
  return !!actor?.effects?.some((e) => statusIdOf(e) === 'unraveled');
}

/** True if Silenced (cannot use abilities). */
export function isSilenced(actor) {
  return !!actor?.effects?.some(
    (e) =>
      CONFIG.DASU.statusEffectIndex[statusIdOf(e)]?.flags?.dasu?.behavior ===
      'silenced'
  );
}

/**
 * preCreate guard for status effects dropped outside {@link applyStatus} (e.g.
 * dragged from a compendium). If the actor already has the stackable status,
 * cancel the duplicate create (return `false`) and bump the existing stack.
 */
function onPreCreateActiveEffect(effect, data) {
  const actor = effect.parent;
  if (!(actor instanceof Actor)) return;
  const statusId =
    data.statuses?.[0] ??
    (effect.statuses ? [...effect.statuses][0] : null) ??
    data.flags?.[SYSTEM]?.statusId ??
    null;
  if (!statusId || !isStackable(statusId)) return;

  const existing = findStatus(actor, statusId);
  if (!existing) return; // first instance: create normally

  applyStatus(actor, statusId, {
    source: data.flags?.[SYSTEM]?.statusSource ?? undefined,
  });
  return false;
}

/** Wire the status automation hooks. Call once during init (after register). */
export function initializeStatusEffects() {
  registerStatusEffects();
  Hooks.on('combatTurnChange', onCombatTurn);
  Hooks.on('preCreateActiveEffect', onPreCreateActiveEffect);
  // After a GM edits any stack-related flag on the Stacks tab, re-clamp the
  // count and resync the scaled changes.
  Hooks.on('updateActiveEffect', (effect, changed) => {
    const flags = changed?.flags?.[SYSTEM];
    if (!flags) return;
    if (
      'stacks' in flags ||
      'maxStacksOverride' in flags ||
      'maxStacksAttr' in flags ||
      'scaleWithStacks' in flags
    ) {
      resyncStacks(effect);
    }
  });
}
