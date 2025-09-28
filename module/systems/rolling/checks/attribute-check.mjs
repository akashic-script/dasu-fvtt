/**
 * Attribute and Skill Check System Handler
 * Handles rendering for attribute and skill checks using the dice pool system
 */

import { CheckTypes } from './core/types.mjs';
import { TemplateUtils } from './utils/templates.mjs';

/**
 * Handle rendering for attribute and skill checks
 * @param {Array} sections - Array to push template sections to
 * @param {Object} result - The check result
 * @param {Actor} actor - The actor making the check
 * @param {Item} [item] - The item being used (for skill checks)
 */
const onRenderCheck = (sections, result, actor, item) => {
  if (result.type !== CheckTypes.ATTRIBUTE && result.type !== CheckTypes.SKILL)
    return;

  const skillName = result.additionalData.skill?.name || item?.name || '';
  const checkLabel = getCheckLabel(result, skillName);

  sections.push({
    partial: 'systems/dasu/templates/chat/checks/attribute-check.hbs',
    data: {
      result,
      actor,
      item,
      checkLabel,
      resultClass: TemplateUtils.getResultClass(
        result.finalResult,
        result.critical
      ),
      successLevel: TemplateUtils.getSuccessLevel(result.finalResult),
      hasSuccesses: result.finalResult > 0,
      hasCrit: result.critical,
      isSkillCheck: result.type === CheckTypes.SKILL,
    },
    order: 10,
  });
};

/**
 * Generate a human-readable label for the check
 * @param {Object} result - The check result
 * @param {string} [itemName=''] - The name of the item/skill being used
 * @returns {string} The formatted check label
 */
function getCheckLabel(result, itemName = '') {
  if (result.type === 'skill')
    return `${
      itemName || game.i18n.localize('DASU.Checks.Skill')
    } ${game.i18n.localize('DASU.Checks.Check')}`;

  // Extract the actual attribute name
  let attrName = game.i18n.localize('DASU.Checks.Attribute');
  if (result.primary?.attribute) {
    attrName = result.primary.attribute;
  } else if (typeof result.primary === 'string') {
    attrName = result.primary;
  } else if (result.primary?.name) {
    attrName = result.primary.name;
  }

  return `${attrName.toUpperCase()} ${game.i18n.localize('DASU.Checks.Check')}`;
}

/**
 * Initialize the attribute check system by registering hooks
 */
const initialize = () => Hooks.on('dasu.renderCheck', onRenderCheck);

/**
 * Attribute and Skill Check system module
 * @namespace
 */
export const AttributeCheck = Object.freeze({ initialize });
