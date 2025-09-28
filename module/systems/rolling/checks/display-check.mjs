/**
 * Display Check System Handler
 * Handles rendering for display checks that show item information without rolling
 */

import { CheckTypes } from './core/types.mjs';

/**
 * Handle rendering for display checks
 * @param {Array} sections - Array to push template sections to
 * @param {Object} result - The check result
 * @param {Actor} actor - The actor displaying the item
 * @param {Item} [item] - The item being displayed
 */
const onRenderCheck = (sections, result, actor, item) => {
  if (result.type !== CheckTypes.DISPLAY) return;

  // For display checks, create a generic display card
  const checkLabel =
    result.additionalData.label ||
    item?.name ||
    game.i18n.localize('DASU.Checks.DisplayRoll');

  sections.push({
    partial: 'systems/dasu/templates/chat/checks/display-roll.hbs',
    data: {
      result,
      actor,
      item,
      checkLabel,
      hasRoll: !!result.roll,
      rollTotal: result.roll?.total || result.finalResult,
      rollFormula: result.roll?.formula || result.additionalData.formula,
      rollTerms: result.roll?.terms || [],
      rollData: result.roll?.data || {},
    },
    order: 10,
  });
};

/**
 * Initialize the display check system by registering hooks
 */
const initialize = () => Hooks.on('dasu.renderCheck', onRenderCheck);

/**
 * Display Check system module for non-rolling items
 * @namespace
 */
export const DisplayCheck = Object.freeze({ initialize });
