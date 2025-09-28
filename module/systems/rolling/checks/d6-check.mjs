/**
 * D6 Check System Handler
 * Handles rendering for accuracy and initiative checks using the 2d6 system
 */

import { CheckTypes } from './core/types.mjs';

/**
 * Handle rendering for D6-based checks (accuracy and initiative)
 * @param {Array} sections - Array to push template sections to
 * @param {Object} result - The check result
 * @param {Actor} actor - The actor making the check
 * @param {Item} [item] - The item being used (for accuracy checks)
 */
const onRenderCheck = (sections, result, actor, item) => {
  if (
    result.type !== CheckTypes.ACCURACY &&
    result.type !== CheckTypes.INITIATIVE
  )
    return;

  const checkLabel =
    result.type === CheckTypes.INITIATIVE
      ? game.i18n.localize('DASU.Checks.InitiativeRoll')
      : `${item?.name || game.i18n.localize('DASU.Checks.AccuracyRoll')}`;

  sections.push({
    partial: 'systems/dasu/templates/chat/checks/accuracy-roll.hbs',
    data: {
      result,
      actor,
      item,
      checkLabel,
    },
    order: 10,
  });
};

/**
 * Initialize the D6 check system by registering hooks
 */
const initialize = () => Hooks.on('dasu.renderCheck', onRenderCheck);

/**
 * D6 Check system module
 * @namespace
 */
export const D6Check = Object.freeze({ initialize });
