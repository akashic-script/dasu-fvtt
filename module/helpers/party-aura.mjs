import { SYSTEM } from './config.mjs';

/**
 * Party auras: an ActiveEffect on a party actor flagged `flags.dasu.partyAura`
 * is mirrored onto every member summoner as a read-only copy tagged
 * `flags.dasu.auraOrigin = <source uuid>`. The party effect is the single
 * source of truth. Unflagging, deleting it, or a member leaving removes the
 * mirrors; an unflagged party effect is just party-local, informational text.
 */

const AURA_FLAG = 'partyAura';
const ORIGIN_FLAG = 'auraOrigin';

/** True if this effect is a broadcasting party aura (source, not a mirror). */
export function isPartyAura(effect) {
  return !!effect.getFlag(SYSTEM, AURA_FLAG) && effect.parent?.type === 'party';
}

/** True if this effect is a mirror copied onto a member from a party aura. */
export function isAuraMirror(effect) {
  return !!effect.getFlag(SYSTEM, ORIGIN_FLAG);
}

/** Build the mirror effect data for a member from a source party aura. */
function mirrorData(source) {
  const data = source.toObject();
  delete data._id;
  data.origin = source.uuid;
  data.flags ??= {};
  data.flags[SYSTEM] = { ...data.flags[SYSTEM] };
  // The mirror is not itself an aura source; tag it back to its origin and
  // mark it undeletable so it can only be removed via the party effect.
  delete data.flags[SYSTEM][AURA_FLAG];
  data.flags[SYSTEM][ORIGIN_FLAG] = source.uuid;
  data.flags[SYSTEM].undeletable = true;
  return data;
}

/** The mirror on `member` for a given source aura uuid, if present. */
function findMirror(member, sourceUuid) {
  return member.effects.find(
    (e) => e.getFlag(SYSTEM, ORIGIN_FLAG) === sourceUuid
  );
}

/** Resolve a party's live member summoners (skips unresolved/deleted). */
async function partyMembers(party) {
  return party.system.getMembers?.() ?? [];
}

/** Create or update `member`'s mirror of `source`. Owner-only. */
async function syncMemberToAura(member, source) {
  if (!member.isOwner) return;
  const existing = findMirror(member, source.uuid);
  const data = mirrorData(source);
  if (existing) {
    await existing.update({ ...data, _id: existing.id });
  } else {
    await member.createEmbeddedDocuments('ActiveEffect', [data]);
  }
}

/** Remove a member's mirror of the given source aura uuid, if any. */
async function removeMemberMirror(member, sourceUuid) {
  if (!member.isOwner) return;
  const mirror = findMirror(member, sourceUuid);
  if (mirror) await mirror.delete({ dasuForce: true });
}

/** Sync every current member's mirror of a party aura. */
export async function syncAuraToMembers(source) {
  const members = await partyMembers(source.parent);
  for (const member of members) await syncMemberToAura(member, source);
}

/** Remove every member's mirror of a source aura (aura removed/disabled). */
export async function removeAuraFromMembers(party, sourceUuid) {
  const members = await partyMembers(party);
  for (const member of members) await removeMemberMirror(member, sourceUuid);
}

/** Reconcile a single member against all of a party's auras. */
export async function syncMemberAuras(party, member) {
  if (!member?.isOwner) return;
  const auras = party.effects.filter((e) => isPartyAura(e));
  const wanted = new Set(auras.map((e) => e.uuid));
  for (const aura of auras) await syncMemberToAura(member, aura);
  // Drop stale mirrors that originate from THIS party but no longer match a
  // live aura. Mirrors sourced from other parties are left untouched, so a
  // summoner may belong to several parties at once.
  const prefix = `${party.uuid}.ActiveEffect.`;
  for (const effect of member.effects) {
    const origin = effect.getFlag(SYSTEM, ORIGIN_FLAG);
    if (origin?.startsWith(prefix) && !wanted.has(origin)) {
      await effect.delete({ dasuForce: true });
    }
  }
}

/** Strip every party-aura mirror from a member (it left the party). */
export async function clearMemberAuras(party, member) {
  if (!member?.isOwner) return;
  const sources = new Set(
    party.effects.filter((e) => isPartyAura(e)).map((e) => e.uuid)
  );
  for (const effect of member.effects) {
    const origin = effect.getFlag(SYSTEM, ORIGIN_FLAG);
    if (origin && sources.has(origin)) await effect.delete({ dasuForce: true });
  }
}

/**
 * Register party-aura sync hooks. Called once from the `ready` hook.
 * Guards on `game.userId === userId` so only the acting client mirrors,
 * avoiding duplicate embedded-document creation across connected clients.
 */
export function initializePartyAuras() {
  const mine = (userId) => game.userId === userId;
  const onErr = (name, err) =>
    Hooks.onError(name, err, { log: 'error', notify: 'error' });

  // Source aura created on a party -> broadcast to members.
  Hooks.on('createActiveEffect', (effect, options, userId) => {
    if (!mine(userId) || !isPartyAura(effect)) return;
    Promise.resolve(syncAuraToMembers(effect)).catch((err) =>
      onErr('createActiveEffect#syncAuraToMembers', err)
    );
  });

  // Source aura changed -> re-broadcast; aura flag toggled off -> tear down.
  Hooks.on('updateActiveEffect', (effect, changes, options, userId) => {
    if (!mine(userId) || effect.parent?.type !== 'party') return;
    const task = isPartyAura(effect)
      ? syncAuraToMembers(effect)
      : removeAuraFromMembers(effect.parent, effect.uuid);
    Promise.resolve(task).catch((err) =>
      onErr('updateActiveEffect#partyAura', err)
    );
  });

  // Source aura deleted -> remove mirrors. (Read from pre-delete flags.)
  Hooks.on('deleteActiveEffect', (effect, options, userId) => {
    if (!mine(userId) || effect.parent?.type !== 'party') return;
    if (!isAuraSourceFlag(effect)) return;
    Promise.resolve(removeAuraFromMembers(effect.parent, effect.uuid)).catch(
      (err) => onErr('deleteActiveEffect#removeAuraFromMembers', err)
    );
  });

  // Capture the pre-change member set so updateActor can diff added/removed.
  Hooks.on('preUpdateActor', (actor, changes, options) => {
    if (actor.type !== 'party') return;
    if (!foundry.utils.hasProperty(changes, 'system.members')) return;
    options.dasuPrevMembers = [...actor.system.members];
  });

  // Membership change on a party -> reconcile added/removed members' mirrors.
  Hooks.on('updateActor', (actor, changes, options, userId) => {
    if (!mine(userId) || actor.type !== 'party') return;
    if (!foundry.utils.hasProperty(changes, 'system.members')) return;
    Promise.resolve(reconcileMembership(actor, options)).catch((err) =>
      onErr('updateActor#reconcilePartyMembership', err)
    );
  });
}

/** Flag check that doesn't require `parent.type` (effect may be mid-delete). */
function isAuraSourceFlag(effect) {
  return !!effect.getFlag(SYSTEM, AURA_FLAG);
}

/** Diff the prior member set: sync auras for joiners, clear them for leavers. */
async function reconcileMembership(party, options) {
  const before = new Set(options?.dasuPrevMembers ?? []);
  const after = new Set(party.system.members);
  for (const uuid of after) {
    if (before.has(uuid)) continue;
    const member = await fromUuid(uuid);
    if (member?.type === 'summoner') await syncMemberAuras(party, member);
  }
  for (const uuid of before) {
    if (after.has(uuid)) continue;
    const member = await fromUuid(uuid);
    if (member?.type === 'summoner') await clearMemberAuras(party, member);
  }
}
