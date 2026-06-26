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

    // Keep the original total; only target hits are re-resolved.
    check.result = oldResult.result;

    const config = CheckConfiguration.configure(check);
    config.setTargets([]).setDefaultTargets().updateTargetResults();

    // Reuse the stored roll; flag it evaluated so processResult won't re-roll.
    const roll = Roll.fromData(oldResult.roll);
    roll._evaluated = true;
    return { check, roll };
  });
}

const onRenderCheck = (data, result) => {
  if (!result.additionalData?.retargeted) return;
  data.tags.unshift({ tag: 'DASU.Check.Retargeted' });
};

/** Resolve the ChatMessage for a context-menu entry. */
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
      label: game.i18n.localize('DASU.Check.Retarget'),
      icon: '<i class="fas fa-crosshairs"></i>',
      visible: (li) =>
        Checks.isCheck(messageFromContext(li), ['accuracy', 'tactic']),
      onClick: (event, target) => {
        const result = messageFromContext(target)?.getFlag(
          SYSTEM,
          Flags.ChatMessage.Check
        );
        if (result?.id) retarget(result.id);
      },
    });
  });
};

export const CheckRetarget = Object.freeze({ initialize });
