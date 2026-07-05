/**
 * Equip/unequip orchestration for DASU's single weapon slot.
 * All mutations go through actor.update() so the data re-prepares and
 * isEquipped/transferEffects flip automatically.
 */

import { combatantForActor } from '../checks/combat-action-hooks.mjs';

export async function equip(actor, item) {
  await actor.update({ 'system.equipped.weapon': item.id });
}

export async function unequip(actor, item) {
  if (actor.system.equipped?.weapon !== item.id) return;
  await actor.update({ 'system.equipped.weapon': null });
}

export async function toggle(actor, item) {
  if (actor.system.equipped?.isEquipped(item)) {
    await unequip(actor, item);
  } else {
    await equip(actor, item);
    await _spendMinorActionIfInCombat(actor);
  }
}

async function _spendMinorActionIfInCombat(actor) {
  const combat = game.combat;
  if (!combat?.started) return;

  // A fielded daemon's equip is a summoner command: charge the summoner's
  // combatant (resolved via system.summonerId), not the daemon's own.
  const combatant = combatantForActor(actor);
  if (!combatant?.isOwner) return;

  const slot = combatant.system?.actions?.minor;
  if (!slot) return;

  const spent = slot.spent ?? 0;
  const max = slot.max ?? 1;
  if (spent >= max) {
    ui.notifications?.warn(
      game.i18n.format('DASU.Combat.Actions.NoneLeft', {
        name: combatant.name,
        action: game.i18n.localize('DASU.Combat.Actions.Minor'),
      })
    );
  }
  await combatant.update({ 'system.actions.minor.spent': spent + 1 });
}
