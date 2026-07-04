/**
 * Resolves the actors a pipeline action applies to.
 *
 * Three sources, in priority order:
 *  - explicit: an actor/token uuid passed on a chat button's dataset
 *  - targeted: the user's current Foundry targets (game.user.targets)
 *  - selected: the user's controlled tokens (canvas selection)
 */

/** Resolve a single actor from an actor or token uuid. */
async function resolveActor(uuid) {
  if (!uuid) return null;
  const doc = await fromUuid(uuid);
  // Token uuids resolve to a TokenDocument; use its actor.
  return doc?.actor ?? (doc instanceof Actor ? doc : null);
}

/** @returns {Actor[]} actors of the user's currently targeted tokens */
function getTargeted() {
  return Array.from(game.user?.targets ?? [])
    .map((t) => t.actor)
    .filter((a) => a);
}

/** @returns {Actor[]} actors of the user's controlled (selected) tokens */
function getSelected() {
  return (canvas?.tokens?.controlled ?? [])
    .map((t) => t.actor)
    .filter((a) => a);
}

/**
 * Resolve the targets for an action.
 * @param {string} [options.uuid]  explicit actor/token uuid (wins if present)
 */
async function resolveTargets({ uuid } = {}) {
  if (uuid) {
    const actor = await resolveActor(uuid);
    return actor ? [actor] : [];
  }
  const targeted = getTargeted();
  if (targeted.length) return targeted;
  return getSelected();
}

export const TargetResolver = Object.freeze({
  resolveActor,
  resolveTargets,
  getTargeted,
  getSelected,
});
