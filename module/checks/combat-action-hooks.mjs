import { CheckHooks } from './check-hooks.mjs';

/**
 * Action-economy tracking, wired into the check pipeline. When a check resolves
 * for a live combatant, spend the matching action (a summoner's daemons ride the
 * summoner's combatant).
 */

/** Check type / item -> which action slot it consumes. */
function actionForCheck(result, item) {
  switch (result.type) {
    case 'accuracy':
    case 'tactic':
      return 'major';
    case 'skill':
      // Only skill *items* spend; a plain skill check does not.
      return item?.type === 'skillAbility' ? 'minor' : null;
    default:
      break;
  }
  if (item?.type === 'ability') return 'major';
  if (item?.type === 'bond') return 'minor';
  return null;
}

/**
 * The live combatant charged for this actor's action: a fielded daemon charges
 * its owning summoner; anyone else charges their own combatant.
 * @param {Actor} actor
 * @returns {Combatant|null}
 */
export function combatantForActor(actor) {
  const combat = game.combat;
  if (!combat?.started) return null;
  if (!actor) return null;

  const direct = combat.combatants.find((c) => c.actor?.id === actor.id);
  if (direct) return direct;

  // A fielded daemon charges its summoner.
  if (actor.type === 'daemon') {
    const ownerId = actor.system?.summonerId;
    if (ownerId) {
      const byOwner = combat.combatants.find((c) => c.actor?.id === ownerId);
      if (byOwner) return byOwner;
    }
    return (
      combat.combatants.find((c) =>
        (c.actor?.system?.stock ?? []).some(
          (e) => e.active && fromUuidSync(e.uuid)?.id === actor.id
        )
      ) ?? null
    );
  }
  return null;
}

/** @type {ProcessCheckHook} */
async function onProcessCheck(result, actor, item, registerCallback) {
  registerCallback(async () => {
    const slotKey = actionForCheck(result, item);
    if (!slotKey) return;

    const combatant = combatantForActor(actor);
    if (!combatant?.isOwner) return;

    const slot = combatant.system?.actions?.[slotKey];
    if (!slot) return;

    if (slotKey === 'free') {
      await combatant.update({
        'system.actions.free.spent': (slot.spent ?? 0) + 1,
      });
      return;
    }

    const max = slot.max ?? 1;
    const spent = slot.spent ?? 0;
    if (spent >= max) {
      ui.notifications?.warn(
        game.i18n.format('DASU.Combat.Actions.NoneLeft', {
          name: combatant.name,
          action: game.i18n.localize(
            `DASU.Combat.Actions.${slotKey === 'major' ? 'Major' : 'Minor'}`
          ),
        })
      );
    }
    await combatant.update({
      [`system.actions.${slotKey}.spent`]: spent + 1,
    });
  }, 500);
}

const initialize = () => {
  Hooks.on(CheckHooks.processCheck, onProcessCheck);
};

export const CombatActionHooks = Object.freeze({ initialize });
