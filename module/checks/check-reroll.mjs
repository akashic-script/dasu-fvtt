import { CheckHooks } from './check-hooks.mjs';
import { Checks, CheckInternals } from './checks.mjs';
import { CheckConfiguration } from './check-configuration.mjs';
import { SYSTEM } from '../helpers/config.mjs';
import { Flags } from '../helpers/flags.mjs';

/**
 * Generic reroll: re-rolls a stored check with the same configuration.
 * Exposed as a chat message context menu entry instead of an in-card button.
 * Marks the result with `additionalData.rerolled = true` so the render hook
 * can inject a "Rerolled" tag at the top of the card.
 */

async function reroll(messageId) {
  await Checks.modifyCheck(messageId, async (oldResult, actor, item) => {
    const check = CheckInternals.checkFromResult(oldResult);
    check.additionalData.rerolled = true;
    const roll = await CheckInternals.rollCheck(check);
    check.result = roll.total;
    CheckConfiguration.configure(check).updateTargetResults();
    return { check, roll };
  });
}

const onRenderCheck = (data, result) => {
  if (!result.additionalData?.rerolled) return;
  data.tags.unshift({ tag: 'DASU.Check.Rerolled' });
};

const messageFromContext = (el) => {
  const node = el?.jquery ? el[0] : el;
  const messageId =
    node?.dataset?.messageId ??
    node?.closest?.('[data-message-id]')?.dataset.messageId;
  return messageId ? game.messages.get(messageId) : undefined;
};

const initialize = () => {
  Hooks.on(CheckHooks.renderCheck, onRenderCheck);

  Hooks.on('getChatMessageContextOptions', (html, options) => {
    options.push({
      label: game.i18n.localize('DASU.Check.Reroll'),
      icon: '<i class="fas fa-dice"></i>',
      visible: (li) => {
        const result = messageFromContext(li)?.getFlag(
          SYSTEM,
          Flags.ChatMessage.Check
        );
        return !!result && result.type !== 'display';
      },
      onClick: (event, target) => {
        const message = messageFromContext(target);
        if (message?.id) reroll(message.id);
      },
    });
  });
};

export const CheckReroll = Object.freeze({ initialize });
