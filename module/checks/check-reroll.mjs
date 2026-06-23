import { CheckHooks } from './check-hooks.mjs';
import { Checks, CheckInternals } from './checks.mjs';
import { SYSTEM } from '../helpers/config.mjs';
import { Flags } from '../helpers/flags.mjs';

/**
 * Generic reroll: re-rolls a stored check with the same configuration.
 * Exposed as a chat message context menu entry instead of an in-card button.
 * Marks the result with `additionalData.rerolled = true` so the render hook
 * can inject a "Rerolled" tag at the top of the card.
 */

async function reroll(checkId) {
  await Checks.modifyCheck(checkId, async (oldResult, actor, item) => {
    const check = CheckInternals.checkFromResult(oldResult);
    check.additionalData.rerolled = true;
    const roll = await CheckInternals.rollCheck(check);
    return { check, roll };
  });
}

const onRenderCheck = (data, result) => {
  if (!result.additionalData?.rerolled) return;
  data.tags.unshift({ tag: 'DASU.Check.Rerolled' });
};

const initialize = () => {
  Hooks.on(CheckHooks.renderCheck, onRenderCheck);

  Hooks.on('getChatMessageContextOptions', (html, options) => {
    options.push({
      name: game.i18n.localize('DASU.Check.Reroll'),
      icon: '<i class="fas fa-dice"></i>',
      condition: (li) => {
        const messageId =
          li.dataset?.messageId ??
          li.closest('[data-message-id]')?.dataset.messageId;
        if (!messageId) return false;
        const message = game.messages.get(messageId);
        const result = message?.getFlag(SYSTEM, Flags.ChatMessage.Check);
        return !!result && result.type !== 'display';
      },
      callback: (li) => {
        const messageId =
          li.dataset?.messageId ??
          li.closest('[data-message-id]')?.dataset.messageId;
        const message = game.messages.get(messageId);
        const result = message?.getFlag(SYSTEM, Flags.ChatMessage.Check);
        if (result?.id) reroll(result.id);
      },
    });
  });
};

export const CheckReroll = Object.freeze({ initialize });
