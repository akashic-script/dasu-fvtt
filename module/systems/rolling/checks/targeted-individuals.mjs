/**
 * Targeted Individuals Section Handler
 * Handles rendering for targeted individuals in checks with hit/miss/crit/fumble color coding
 */

import { TemplateUtils } from './utils/templates.mjs';
import { CheckTypes } from './core/types.mjs';

/**
 * Handle rendering for targeted individuals section
 * @param {Array} sections - Array to push template sections to
 * @param {Object} result - The check result
 * @param {Actor} actor - The actor making the check
 * @param {Item} [item] - The item being used
 */
const onRenderCheck = (sections, result, actor, item) => {
  // Exclude attribute, skill, initiative, and display checks from showing targets
  const excludedTypes = [
    CheckTypes.ATTRIBUTE,
    CheckTypes.SKILL,
    CheckTypes.INITIATIVE,
    CheckTypes.DISPLAY,
  ];

  if (excludedTypes.includes(result.type)) {
    return;
  }

  // Render the targeted individuals section
  const hasTargets =
    result.targetedIndividuals && result.targetedIndividuals.length > 0;

  // Process each targeted individual with their result if any exist
  const processedTargets = hasTargets
    ? result.targetedIndividuals.map((target) => ({
        ...target,
        resultClass: getTargetResultClass(target.result),
        resultText: getTargetResultText(target.result),
        borderClass: getTargetBorderClass(target.result),
        bgClass: getTargetBackgroundClass(target.result),
      }))
    : [];

  sections.push({
    partial: 'systems/dasu/templates/chat/checks/targeted-individuals.hbs',
    data: {
      targets: processedTargets,
      hasTargets: hasTargets,
      isRestorative:
        item?.type === 'ability' && item?.system?.category === 'restorative',
    },
    order: 15, // Render after main check result
  });
};

/**
 * Get the CSS class for target result styling
 * @param {string} result - The target result (hit, miss, crit, fumble)
 * @returns {string} The CSS class name
 */
function getTargetResultClass(result) {
  switch (result?.toLowerCase()) {
    case 'crit':
    case 'critical':
      return 'target-crit';
    case 'hit':
      return 'target-hit';
    case 'miss':
      return 'target-miss';
    case 'fumble':
      return 'target-fumble';
    default:
      return 'target-unknown';
  }
}

/**
 * Get the border CSS class for target result styling
 * @param {string} result - The target result (hit, miss, crit, fumble)
 * @returns {string} The border CSS class name
 */
function getTargetBorderClass(result) {
  switch (result?.toLowerCase()) {
    case 'crit':
    case 'critical':
      return 'border-crit';
    case 'hit':
      return 'border-hit';
    case 'miss':
      return 'border-miss';
    case 'fumble':
      return 'border-fumble';
    default:
      return 'border-unknown';
  }
}

/**
 * Get the background CSS class for target result styling
 * @param {string} result - The target result (hit, miss, crit, fumble)
 * @returns {string} The background CSS class name
 */
function getTargetBackgroundClass(result) {
  switch (result?.toLowerCase()) {
    case 'crit':
    case 'critical':
      return 'bg-crit';
    case 'hit':
      return 'bg-hit';
    case 'miss':
      return 'bg-miss';
    case 'fumble':
      return 'bg-fumble';
    default:
      return 'bg-unknown';
  }
}

/**
 * Get human-readable text for target result
 * @param {string} result - The target result (hit, miss, crit, fumble)
 * @returns {string} The localized result text
 */
function getTargetResultText(result) {
  switch (result?.toLowerCase()) {
    case 'crit':
    case 'critical':
      return game.i18n.localize('DASU.Checks.TargetResult.Critical');
    case 'hit':
      return game.i18n.localize('DASU.Checks.TargetResult.Hit');
    case 'miss':
      return game.i18n.localize('DASU.Checks.TargetResult.Miss');
    case 'fumble':
      return game.i18n.localize('DASU.Checks.TargetResult.Fumble');
    default:
      return game.i18n.localize('DASU.Checks.TargetResult.Unknown');
  }
}

/**
 * Handle adding targets to an existing check
 * @param {Event} event - The click event
 * @private
 */
const onAddTargetsClick = async (event) => {
  const button = event.target.closest('[data-action="addTargets"]');
  if (!button) return;

  // Get currently targeted tokens
  const targets = game.user.targets;
  if (targets.size === 0) {
    ui.notifications.warn('No tokens are currently targeted');
    return;
  }

  // Find the original chat message
  const chatMessage = button.closest('.message');
  if (!chatMessage) return;

  const messageId = chatMessage.dataset.messageId;
  const originalMessage = game.messages.get(messageId);
  if (!originalMessage) return;

  // Extract check information from the original message
  const checkResult = originalMessage.flags?.dasu?.checkResult;
  if (!checkResult) {
    ui.notifications.error('Could not find check information in chat message');
    return;
  }

  // Extract actor from UUID (handle both simple and complex UUIDs)
  let sourceActor = null;
  if (checkResult.actorUuid) {
    const actorUuidParts = checkResult.actorUuid.split('.');
    let actorId;

    if (actorUuidParts.length > 2 && actorUuidParts[0] === 'Scene') {
      // Complex UUID: Scene.xxx.Token.xxx.Actor.xxx
      actorId = actorUuidParts[actorUuidParts.length - 1];
    } else {
      // Simple UUID: Actor.xxx
      actorId = actorUuidParts[1];
    }

    sourceActor = game.actors.get(actorId);
  }

  if (!sourceActor) {
    ui.notifications.error('Original actor not found');
    return;
  }

  // Extract item from UUID if available
  let item = null;
  if (checkResult.itemUuid) {
    const itemUuidParts = checkResult.itemUuid.split('.');
    let itemId;

    if (itemUuidParts.length > 4 && itemUuidParts[0] === 'Scene') {
      // Complex UUID: Scene.xxx.Token.xxx.Actor.xxx.Item.xxx
      itemId = itemUuidParts[itemUuidParts.length - 1];
    } else {
      // Simple UUID: Actor.xxx.Item.xxx
      itemId = itemUuidParts[3];
    }

    item = sourceActor.items.get(itemId);
  }

  if (!item) {
    ui.notifications.error('Original item not found');
    return;
  }

  // Recreate the chat message with new targets
  try {
    // Process new targets - convert from user targets to targeted individuals format
    const newTargetedIndividuals = Array.from(targets).map((token) => {
      // Use the same result as the original check (or default to 'hit' if no original targets)
      const originalResult =
        checkResult.targetedIndividuals?.[0]?.result || 'hit';

      return {
        actorId: token.actor.id,
        tokenId: token.id,
        name: token.name,
        result: originalResult,
      };
    });

    // Create updated check result with new targets
    const updatedCheckResult = foundry.utils.mergeObject(checkResult, {
      targetedIndividuals: newTargetedIndividuals,
    });

    // Get the sections from the original message to recreate it
    const sections = [];
    const additionalFlags = {};

    // Call the render hook to generate sections (including our updated targeted individuals)
    Hooks.call(
      'dasu.renderCheck',
      sections,
      updatedCheckResult,
      sourceActor,
      item
    );

    // Build content from sections
    let content = '';
    const sortedSections = sections.sort(
      (a, b) => (a.order || 0) - (b.order || 0)
    );

    for (const section of sortedSections) {
      if (section.partial) {
        const sectionContent =
          await foundry.applications.handlebars.renderTemplate(
            section.partial,
            section.data
          );
        content += sectionContent;
      }
    }

    // Create the new chat message with updated data
    const newChatData = {
      author: originalMessage.author,
      speaker: originalMessage.speaker,
      content: content,
      style: originalMessage.style,
      flags: foundry.utils.mergeObject(originalMessage.flags, {
        dasu: {
          ...originalMessage.flags.dasu,
          checkResult: updatedCheckResult,
          ...additionalFlags,
        },
      }),
    };

    // Create new message and delete the old one
    const newMessage = await ChatMessage.create(newChatData);
    await originalMessage.delete();

    ui.notifications.info(
      `Updated ${item.name} with ${targets.size} new target(s)`
    );
  } catch (error) {
    ui.notifications.error('Failed to update targets');
  }
};

/**
 * Initialize the targeted individuals system by registering hooks
 */
const initialize = () => {
  Hooks.on('dasu.renderCheck', onRenderCheck);

  // Setup event listener for add targets button
  document.addEventListener('click', onAddTargetsClick);
};

/**
 * Targeted Individuals system module
 * @namespace
 */
export const TargetedIndividuals = Object.freeze({
  initialize,
  onAddTargetsClick,
});
