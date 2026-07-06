/**
 * Resolves the actors a pipeline action applies to, in priority order:
 * explicit uuid -> targeted tokens -> (optional) the user's own character.
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
 * @param {string} [options.uuid]   explicit actor/token uuid (wins if present)
 * @param {boolean} [options.allowSelf]  final fallback to the user's own
 *   character. Off by default so pipeline callers keep explicit targeting.
 */
async function resolveTargets({
  uuid,
  allowSelf = false,
} = {}) {
  if (uuid) {
    const actor = await resolveActor(uuid);
    return actor ? [actor] : [];
  }
  const targeted = getTargeted();
  if (targeted.length) return targeted;
  if (allowSelf && game.user?.character) return [game.user.character];
  return [];
}

export const TargetResolver = Object.freeze({
  resolveActor,
  resolveTargets,
  getTargeted,
  getSelected,
});
