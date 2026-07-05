/**
 * Equip/unequip orchestration for DASU's single weapon slot.
 * All mutations go through actor.update() so the data re-prepares and
 * isEquipped/transferEffects flip automatically.
 */

export async function equip(actor, item) {
  await actor.update({ 'system.equipped.weapon': item.id });
}

export async function unequip(actor, item) {
  if (actor.system.equipped?.weapon !== item.id) return;
  await actor.update({ 'system.equipped.weapon': null });
}

export async function toggle(actor, item) {
  // TODO: minor-action on equip during combat
  if (actor.system.equipped?.isEquipped(item)) {
    await unequip(actor, item);
  } else {
    await equip(actor, item);
  }
}
