import { CheckHooks } from './check-hooks.mjs';
import { Checks, CheckInternals } from './checks.mjs';
import { CheckConfiguration } from './check-configuration.mjs';
import { SYSTEM } from '../helpers/config.mjs';
import { Flags } from '../helpers/flags.mjs';

/**
 * Generic retarget: re-resolves a stored check against the user's *current*
 * Foundry targets, keeping the original roll. The dice total is unchanged;
 * only the target list and per-target hit/miss are recomputed.
 *
 * Exposed as a chat message context menu entry (alongside Reroll). Marks the
 * result with `additionalData.retargeted = true` so the render hook can inject
 * a "Retargeted" tag at the top of the card.
 */

async function retarget(checkId) {
  await Checks.modifyCheck(checkId, async (oldResult) => {
    const check = CheckInternals.checkFromResult(oldResult);
    check.additionalData.retargeted = true;

    // Carry the original total so target hits can be re-resolved without rolling.
    check.result = oldResult.result;

    const config = CheckConfiguration.configure(check);
    config.setTargets([]).setDefaultTargets().updateTargetResults();

    // Reuse the stored roll verbatim - retarget never re-rolls.
    const roll = Roll.fromData(oldResult.roll);
    return { check, roll };
  });
}

const onRenderCheck = (data, result) => {
  if (!result.additionalData?.retargeted) return;
  data.tags.unshift({ tag: 'DASU.Check.Retargeted' });
};

const initialize = () => {
  Hooks.on(CheckHooks.renderCheck, onRenderCheck);

  Hooks.on('getChatMessageContextOptions', (html, options) => {
    options.push({
      name: game.i18n.localize('DASU.Check.Retarget'),
      icon: '<i class="fas fa-crosshairs"></i>',
      condition: (li) => {
        const messageId =
          li.dataset?.messageId ??
          li.closest('[data-message-id]')?.dataset.messageId;
        if (!messageId) return false;
        const message = game.messages.get(messageId);
        return Checks.isCheck(message, ['accuracy', 'tactic']);
      },
      callback: (li) => {
        const messageId =
          li.dataset?.messageId ??
          li.closest('[data-message-id]')?.dataset.messageId;
        const message = game.messages.get(messageId);
        const result = message?.getFlag(SYSTEM, Flags.ChatMessage.Check);
        if (result?.id) retarget(result.id);
      },
    });
  });
};

export const CheckRetarget = Object.freeze({ initialize });
