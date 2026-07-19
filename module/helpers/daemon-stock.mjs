/**
 * Import a compendium daemon into the world as a fresh actor, in the "Summoned
 * Daemons" folder (created on first use). Returns the new Actor, or null.
 * @param {Actor} packActor  The compendium daemon document.
 * @returns {Promise<Actor|null>}
 */
export async function importDaemonToWorld(packActor) {
  const folderName = 'Summoned Daemons';
  let folder = game.folders.find(
    (f) => f.type === 'Actor' && f.name === folderName
  );
  if (!folder) {
    folder = await Folder.create({ name: folderName, type: 'Actor' });
  }
  const data = packActor.toObject();
  delete data._id;
  data.folder = folder?.id ?? null;
  const created = await getDocumentClass('Actor').create(data);
  if (!created) {
    ui.notifications?.warn(
      `Failed to import ${packActor.name} into the world.`
    );
    return null;
  }
  return created;
}

/**
 * Set a fielded daemon's token to a linked, friendly-disposition token, so it
 * behaves like a party member on the canvas rather than a hostile NPC. Call
 * whenever a daemon joins a summoner's stock or party storage.
 * @param {Actor} daemon
 */
export async function linkDaemonToken(daemon) {
  const token = daemon.prototypeToken;
  if (
    token.actorLink &&
    token.disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY
  )
    return;
  await daemon.update({
    'prototypeToken.actorLink': true,
    'prototypeToken.disposition': CONST.TOKEN_DISPOSITIONS.FRIENDLY,
  });
}

/**
 * Add a dropped daemon to a summoner's stock: import-if-from-pack, enforce
 * the single-owner invariant, dedupe, then push `{ uuid, active: false }`.
 * @param {Actor} summoner  The summoner gaining the daemon.
 * @param {Actor} dropped   The dropped Actor document (world or pack daemon).
 * @returns {Promise<boolean>}
 */
export async function addDaemonToStock(summoner, dropped) {
  if (!dropped || dropped.type !== 'daemon') return false;

  // Compendium daemon = template: import a fresh world copy per drop, so each
  // is uniquely owned and the single-owner invariant holds by construction.
  if (dropped.pack) {
    dropped = await importDaemonToWorld(dropped);
    if (!dropped) return false;
  } else {
    // A world daemon belongs to at most one summoner: reject if already
    // rostered by a different live summoner. A stale ref falls through and is
    // reclaimed. `system.summonerId` is synced by DASUActor.
    const ownerId = dropped.system?.summonerId;
    if (ownerId && ownerId !== summoner.id) {
      const owner = game.actors.get(ownerId);
      const stillOwned = owner?.system?.stock?.some(
        (e) => e.uuid === dropped.uuid
      );
      if (owner && stillOwned) {
        const key = 'DASU.Stock.OwnedByOther';
        ui.notifications?.warn(
          game.i18n.has(key)
            ? game.i18n.format(key, { name: owner.name })
            : `This daemon is already in ${owner.name}'s stock.`
        );
        return false;
      }
    }
  }

  const stock = foundry.utils.deepClone(summoner.system.stock ?? []);
  if (stock.some((e) => e.uuid === dropped.uuid)) {
    ui.notifications?.warn(game.i18n.localize('DASU.Stock.AlreadyAdded'));
    return false;
  }
  stock.push({ uuid: dropped.uuid, active: false });
  await summoner.update({ 'system.stock': stock });
  await linkDaemonToken(dropped);
  return true;
}

/**
 * Move a daemon from a summoner's stock into their party's shared storage.
 * The daemon becomes unowned (`summonerId` is cleared by the summoner's own
 * `#syncStockOwnership` when its stock is updated) until a member claims it
 * back out with `claimFromPartyStorage`.
 * @param {Actor} party     The party actor gaining the stored daemon.
 * @param {Actor} summoner  The summoner currently owning it.
 * @param {string} uuid     The daemon's uuid.
 * @returns {Promise<boolean>}
 */
export async function moveToPartyStorage(party, summoner, uuid) {
  const stock = (summoner.system.stock ?? []).filter((e) => e.uuid !== uuid);
  if (stock.length === summoner.system.stock.length) return false;
  await summoner.update({ 'system.stock': stock });
  await party.system.addToStorage(uuid);
  return true;
}

/**
 * Claim a daemon out of a party's shared storage into a summoner's own
 * stock. Reuses `addDaemonToStock` for the single-owner/dedupe checks.
 * @param {Actor} party     The party actor losing the stored daemon.
 * @param {Actor} summoner  The summoner claiming it.
 * @param {string} uuid     The daemon's uuid.
 * @returns {Promise<boolean>}
 */
export async function claimFromPartyStorage(party, summoner, uuid) {
  const daemon = await fromUuid(uuid);
  if (!daemon || daemon.type !== 'daemon') return false;
  const claimed = await addDaemonToStock(summoner, daemon);
  if (!claimed) return false;
  await party.system.removeFromStorage(uuid);
  return true;
}

/** Warn (but don't block) if fielded daemons exceed the Will Strain Cap. */
function warnIfOverStrain(summoner, stock) {
  const cap = summoner.system.willStrain?.cap ?? 0;
  const used = stock
    .filter((e) => e.active)
    .reduce(
      (sum, e) => sum + (fromUuidSync(e.uuid)?.system?.strain?.value ?? 0),
      0
    );
  if (used > cap) {
    ui.notifications?.warn(
      game.i18n.format('DASU.Stock.OverStrain', { used, cap })
    );
  }
}

/**
 * Field/bench a daemon by flipping its `active` flag. Benching also clears
 * channeling, since a daemon can't be channeled off-field.
 */
export async function toggleStockActive(summoner, uuid) {
  const stock = foundry.utils.deepClone(summoner.system.stock ?? []);
  const entry = stock.find((e) => e.uuid === uuid);
  if (!entry) return false;
  const activating = !entry.active;
  entry.active = activating;
  if (!activating) entry.channeled = false;
  await summoner.update({ 'system.stock': stock });
  if (activating) warnIfOverStrain(summoner, stock);
  return true;
}

/**
 * Toggle a daemon's `channeled` flag. Exclusive per summoner. Channeling an
 * inactive daemon also fields it, since it can't be channeled off-field.
 */
export async function toggleStockChanneled(summoner, uuid) {
  const stock = foundry.utils.deepClone(summoner.system.stock ?? []);
  const entry = stock.find((e) => e.uuid === uuid);
  if (!entry) return false;
  const channeling = !entry.channeled;
  if (channeling) {
    entry.active = true;
    for (const e of stock) e.channeled = false;
  }
  entry.channeled = channeling;
  await summoner.update({ 'system.stock': stock });
  if (channeling) warnIfOverStrain(summoner, stock);
  return true;
}
