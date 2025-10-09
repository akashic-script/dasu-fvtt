/**
 * @fileoverview Healing Event Handlers
 * Handles click events for healing application buttons in the DASU system.
 * Provides manual healing application with undo/edit functionality similar to damage system.
 */

import { HealingEditDialog } from '../../../ui/dialogs/healing-edit-dialog.mjs';

/**
 * Handle healing application button clicks
 * @param {Event} event - The click event
 * @param {HTMLElement} button - The button that was clicked
 * @private
 */
async function onHealingButtonClick(event, button) {
  event.preventDefault();

  if (!button || !button.dataset) {
    return;
  }

  const action = button.dataset.action;
  const itemId = button.dataset.itemId;
  const amount = parseInt(button.dataset.amount);
  const type = button.dataset.type;

  // Find the item (check world items first, then actor items)
  const item =
    game.items.get(itemId) ||
    game.actors.contents.find((a) => a.items.get(itemId))?.items.get(itemId);

  if (!item) {
    ui.notifications.error('Healing item not found');
    return;
  }

  const targets = await _resolveHealingTargets(action, item);
  if (!targets.length) return;

  // Disable button to prevent double-clicking
  button.disabled = true;

  try {
    const results = await _applyHealingToTargets(targets, amount, type, item);
    await _createHealingApplicationMessages(results, item);

    ui.notifications.info(`Applied healing to ${results.length} target(s)`);
  } catch (error) {
    ui.notifications.error(`Failed to apply healing: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

/**
 * Resolve healing targets based on the action type
 * @param {string} action - The action type ('applySelf' or 'applyTargeted')
 * @param {Item} item - The healing item
 * @returns {Promise<Array>} Array of target tokens/actors
 * @private
 */
async function _resolveHealingTargets(action, item) {
  let targets = [];

  if (action === 'applySelf') {
    if (item.actor) {
      const selfToken = item.actor.getActiveTokens()[0];
      targets = selfToken
        ? [selfToken]
        : [{ actor: item.actor, id: 'actor-only' }];
    }
  } else if (action === 'applyTargeted') {
    targets = Array.from(game.user.targets);
    if (targets.length === 0) {
      ui.notifications.warn('No targets selected for healing application');
      return [];
    }
  }

  if (targets.length === 0) {
    ui.notifications.warn('No valid targets found for healing');
  }

  return targets;
}

/**
 * Calculate final healing amount including governing attribute bonus
 * @param {number} baseAmount - Base healing amount from the item
 * @param {Item} item - The healing item (govern field determines attribute)
 * @returns {number} Final healing amount with governing attribute bonus
 * @private
 */
function _calculateFinalHealing(baseAmount, item) {
  if (!item || !item.actor) {
    return baseAmount;
  }

  const sourceActor = item.actor;
  // Get attribute tick - use item's governing attribute or default to POW
  const attributeTick = item.system?.govern || 'pow';

  // Get governing attribute tick value for healing bonus
  let tickValue = 1; // Default tick value
  if (sourceActor.system?.attributes?.[attributeTick]?.tick) {
    tickValue = sourceActor.system.attributes[attributeTick].tick;
  } else if (sourceActor.system?.attributes?.[attributeTick]?.current) {
    // Fallback: calculate tick from current value (DASU: 1 tick per 5 points)
    tickValue = Math.max(
      1,
      Math.floor(sourceActor.system.attributes[attributeTick].current / 5)
    );
  }

  // Calculate final healing using DASU formula: Base Healing + Governing Attribute Tick
  const finalAmount = baseAmount + tickValue;

  return Math.max(0, finalAmount);
}

/**
 * Apply healing to multiple targets
 * @param {Array} targets - Array of target tokens/actors
 * @param {number} amount - Base amount of healing to apply
 * @param {string} type - Type of healing (hp, wp, both)
 * @param {Item} item - The healing item (for attribute tick calculation)
 * @returns {Promise<Array>} Array of healing results
 * @private
 */
async function _applyHealingToTargets(targets, amount, type, item) {
  const results = [];

  // Calculate final healing amount including attribute tick
  const finalHealingAmount = _calculateFinalHealing(amount, item);

  for (const target of targets) {
    if (!target.actor) continue;

    try {
      const healingResult = await target.actor.applyHealing(
        finalHealingAmount,
        type
      );
      results.push({
        targetId: target.actor.id,
        targetName: target.actor.name,
        targetImg: target.actor.img,
        appliedHealing: healingResult.applied,
        healingType: type,
        totalHealing: finalHealingAmount,
        tokenId: target.id,
      });
    } catch (error) {
      results.push({
        targetId: target.actor.id,
        targetName: target.actor.name,
        targetImg: target.actor.img,
        appliedHealing: 0,
        healingType: type,
        totalHealing: finalHealingAmount,
        tokenId: target.id,
        error: error.message,
      });
    }
  }

  return results;
}

/**
 * Create healing application messages for all results
 * @param {Array} results - Array of healing results
 * @param {Item} item - The source healing item
 * @returns {Promise<void>}
 * @private
 */
async function _createHealingApplicationMessages(results, item) {
  for (const result of results) {
    await createHealingApplicationMessage(result, item);
  }
}

/**
 * Create individual healing application message (similar to damage application)
 * @param {Object} result - Healing result for a single target
 * @param {string} result.targetId - Target actor ID
 * @param {string} result.targetName - Target actor name
 * @param {number} result.appliedHealing - Amount of healing actually applied
 * @param {string} result.healingType - Type of healing (hp, wp, both)
 * @param {string} [result.error] - Error message if healing failed
 * @param {Item} item - The source healing item
 * @returns {Promise<ChatMessage>} The created chat message
 * @private
 */
async function createHealingApplicationMessage(result, item) {
  const speaker = ChatMessage.getSpeaker({ actor: item.actor });

  const { healingText, icon, cssClass } = _getHealingDisplayInfo(result);
  const content = _buildHealingApplicationContent(
    result,
    item,
    healingText,
    icon,
    cssClass
  );

  const chatData = {
    user: game.user.id,
    speaker: speaker,
    content: content,
    style: foundry.CONST.CHAT_MESSAGE_STYLES.OTHER,
    flags: {
      dasu: {
        healingApplication: result,
        sourceItem: {
          id: item.id,
          name: item.name,
          type: item.type,
        },
      },
    },
  };

  return await ChatMessage.create(chatData);
}

/**
 * Get display information for healing result
 * @param {Object} result - Healing result
 * @returns {Object} Display info object
 * @private
 */
function _getHealingDisplayInfo(result) {
  if (result.error) {
    return {
      healingText: 'failed',
      icon: '⚠',
      cssClass: 'error',
    };
  }

  if (result.appliedHealing > 0) {
    return {
      healingText: 'healed',
      icon: '♥',
      cssClass: 'success',
    };
  }

  return {
    healingText: 'restored (already at max)',
    icon: '○',
    cssClass: 'no-change',
  };
}

/**
 * Build HTML content for healing application message
 * @param {Object} result - Healing result
 * @param {Item} item - Source item
 * @param {string} healingText - Display text for healing action
 * @param {string} icon - Icon to display
 * @param {string} cssClass - CSS class for styling
 * @returns {string} HTML content
 * @private
 */
function _buildHealingApplicationContent(
  result,
  item,
  healingText,
  icon,
  cssClass
) {
  let content = `<div class='dasu healing-applied ${cssClass}'>`;
  content += "<div class='healing-applied-content'>";

  // Healing text
  content += "<div class='healing-text'>";
  content += `<span class='healing-icon'>${icon}</span>`;
  // Include token ID for unlinked tokens
  const targetDataAttrs = `data-actor-id="${result.targetId}"${
    result.tokenId ? ` data-token-id="${result.tokenId}"` : ''
  }`;
  content += `<strong class="target-name clickable" ${targetDataAttrs}>${result.targetName}</strong> ${healingText}`;

  if (!result.error && result.appliedHealing > 0) {
    content += ` <strong class='healing-amount'>${
      result.appliedHealing
    }</strong> ${result.healingType.toUpperCase()}`;
  }

  if (result.error) {
    content += ` (${result.error})`;
  }

  if (item.name) {
    content += ` <span class='source-item'>from ${item.name}</span>`;
  }
  content += '</div>';

  // Action buttons
  content += "<div class='healing-actions-small'>";
  content += `<button class='healing-action-btn undo' data-action='undoHealing' data-target-id='${result.targetId}' data-amount='${result.appliedHealing}' data-resource='${result.healingType}' data-is-healing='true'>`;
  content += "<i class='fas fa-undo'></i>Undo";
  content += '</button>';
  content += `<button class='healing-action-btn edit' data-action='editHealing' data-target-id='${result.targetId}'>`;
  content += "<i class='fas fa-edit'></i>Edit";
  content += '</button>';
  content += '</div>';

  content += '</div>';
  content += '</div>';

  return content;
}

/**
 * Handle individual target healing from targeted individuals section
 * @param {Event} event - The click event
 * @param {HTMLElement} button - The button that was clicked
 * @private
 */
async function onTargetedHealingClick(event, button) {
  event.preventDefault();

  const actorId = button.dataset.actorId;
  const tokenId = button.dataset.tokenId;
  const result = button.dataset.result; // hit, miss, crit, fumble

  try {
    // Extract healing item data from parent chat message
    const chatMessage = button.closest('.message-content');
    const healingData = _extractHealingData(chatMessage);

    if (!healingData) {
      ui.notifications.warn('Could not extract healing data from chat message');
      return;
    }

    // Only apply healing on hits and crits (not miss/fumble)
    if (result === 'miss' || result === 'fumble') {
      ui.notifications.info('Healing missed - no effect applied');
      return;
    }

    const healingConfig = {
      ...healingData,
      targets: [{ actorId, tokenId, result }],
      isCritical: result === 'crit',
    };

    await _processTargetedHealing(healingConfig);
  } catch (error) {
    ui.notifications.error(`Failed to apply healing: ${error.message}`);
  }
}

/**
 * Handle apply all targeted healing button clicks
 * @param {Event} event - The click event
 * @param {HTMLElement} button - The button that was clicked
 * @private
 */
async function onApplyTargetedHealingClick(event, button) {
  event.preventDefault();

  try {
    // Extract healing item data from parent chat message
    const chatMessage = button.closest('.message-content');
    const healingData = _extractHealingData(chatMessage);

    if (!healingData) {
      ui.notifications.warn('Could not extract healing data from chat message');
      return;
    }

    // Get all targeted individuals from the same chat message
    const targetButtons = chatMessage.querySelectorAll(
      '[data-action="applyHealing"]'
    );
    const targets = Array.from(targetButtons).map((btn) => ({
      actorId: btn.dataset.actorId,
      tokenId: btn.dataset.tokenId,
      result: btn.dataset.result,
    }));

    if (targets.length === 0) {
      ui.notifications.warn('No targets found to apply healing to');
      return;
    }

    // Filter out misses and fumbles
    const validTargets = targets.filter(
      (t) => t.result !== 'miss' && t.result !== 'fumble'
    );

    if (validTargets.length === 0) {
      ui.notifications.info('All healing attempts missed - no effects applied');
      return;
    }

    const healingConfig = {
      ...healingData,
      targets: validTargets,
    };

    await _processTargetedHealing(healingConfig);

    // Disable the apply all button
    button.disabled = true;
    button.textContent = 'Applied';
  } catch (error) {
    ui.notifications.error(`Failed to apply healing: ${error.message}`);
  }
}

/**
 * Extract healing data from chat message
 * @param {HTMLElement} chatMessage - The chat message element
 * @returns {Object|null} Healing data or null if not found
 * @private
 */
function _extractHealingData(chatMessage) {
  // Try to find healing item data in chat message data
  const messageId = chatMessage.closest('.message')?.dataset?.messageId;
  if (!messageId) return null;

  const message = game.messages.get(messageId);
  const flags = message?.flags?.dasu;

  // Get item from itemId in flags
  if (flags?.itemId) {
    const item =
      game.items.get(flags.itemId) ||
      game.actors.contents
        .find((a) => a.items.get(flags.itemId))
        ?.items.get(flags.itemId);

    if (
      item &&
      item.type === 'ability' &&
      item.system?.category === 'restorative'
    ) {
      return {
        item: item,
        healingAmount: item.system.healed?.value || 0,
        healingType: item.system.healed?.type || 'hp',
        attributeTick: item.system.govern || 'pow',
      };
    }
  }

  return null;
}

/**
 * Process targeted healing for multiple targets
 * @param {Object} config - Healing configuration
 * @private
 */
async function _processTargetedHealing(config) {
  const results = [];

  for (const target of config.targets) {
    // Get the target actor (handle both linked and unlinked tokens)
    let targetActor;
    const token = game.canvas?.tokens?.placeables.find(
      (t) => t.actor?.id === target.actorId
    );
    if (token && !token.document.actorLink) {
      targetActor = token.actor; // Unlinked token
    } else {
      targetActor = game.actors.get(target.actorId); // Linked actor
    }

    if (!targetActor) continue;

    try {
      // Calculate healing amount including governing attribute bonus
      const baseAmount = config.healingAmount;
      const sourceActor = config.item.actor;
      let tickValue = 0;

      if (sourceActor) {
        // Get attribute tick - prioritize modifier override (dialog selection) over item's govern field
        const attributeTick =
          config.attributeTick || config.item?.system?.govern || 'pow';
        if (sourceActor.system?.attributes?.[attributeTick]?.tick) {
          tickValue = sourceActor.system.attributes[attributeTick].tick;
        } else if (sourceActor.system?.attributes?.[attributeTick]?.current) {
          // Fallback: calculate tick from current value (DASU: 1 tick per 5 points)
          tickValue = Math.max(
            1,
            Math.floor(sourceActor.system.attributes[attributeTick].current / 5)
          );
        }
      }

      // Calculate final healing using DASU formula: Base Healing + Governing Attribute Tick
      let finalAmount = baseAmount + tickValue;

      // Apply critical healing bonus
      if (target.result === 'crit') {
        finalAmount *= 2;
      }

      // Apply the healing
      const healingResult = await targetActor.applyHealing(
        finalAmount,
        config.healingType
      );

      results.push({
        targetId: targetActor.id,
        targetName: targetActor.name,
        targetImg: targetActor.img,
        appliedHealing: healingResult.applied,
        healingType: config.healingType,
        totalHealing: finalAmount,
        tokenId: target.tokenId,
      });
    } catch (error) {
      results.push({
        targetId: targetActor.id,
        targetName: targetActor.name,
        targetImg: targetActor.img,
        appliedHealing: 0,
        healingType: config.healingType,
        totalHealing: 0,
        tokenId: target.tokenId,
        error: error.message,
      });
    }
  }

  // Create healing application messages
  for (const result of results) {
    await createHealingApplicationMessage(result, config.item);
  }

  ui.notifications.info(`Applied healing to ${results.length} target(s)`);
}

/**
 * Handle undo healing button clicks
 * Reverses healing by applying equivalent damage
 * @param {Event} event - The click event
 * @param {HTMLElement} button - The button that was clicked
 * @private
 */
async function onUndoHealingClick(event, button) {
  event.preventDefault();

  const targetId = button.dataset.targetId;
  const amount = parseInt(button.dataset.amount);
  const resource = button.dataset.resource;

  if (!amount || amount <= 0) {
    ui.notifications.warn('No healing to undo');
    return;
  }

  try {
    const targetActor = _findTargetActor(targetId);
    if (!targetActor) {
      ui.notifications.error('Target actor not found');
      return;
    }

    // Reverse the healing by applying damage
    await targetActor.applyDamage(amount, 'none', resource, {
      suppressChat: true,
    });
    ui.notifications.info(
      `Undid ${amount} ${resource.toUpperCase()} healing for ${
        targetActor.name
      }`
    );

    // Replace undo button with redo button
    button.innerHTML = '<i class="fas fa-redo"></i>Redo';
    button.dataset.action = 'redoHealing';
    button.classList.remove('undo');
    button.classList.add('redo');
  } catch (error) {
    ui.notifications.error(`Failed to undo healing: ${error.message}`);
  }
}

/**
 * Handle undo cost button clicks (restore resources after cost was paid)
 * @param {Event} event - The click event
 * @param {HTMLElement} button - The button that was clicked
 * @private
 */
async function onUndoCostClick(event, button) {
  event.preventDefault();

  const targetId = button.dataset.targetId;
  const amount = parseInt(button.dataset.amount);
  const resource = button.dataset.resource;

  if (!amount || amount <= 0) {
    ui.notifications.warn('No cost to undo');
    return;
  }

  try {
    const targetActor = _findTargetActor(targetId);
    if (!targetActor) {
      ui.notifications.error('Target actor not found');
      return;
    }

    // Reverse the cost by applying healing
    await targetActor.applyHealing(amount, resource, {
      suppressChat: true,
    });

    ui.notifications.info(
      `Restored ${amount} ${resource.toUpperCase()} for ${targetActor.name}`
    );

    // Replace undo button with redo button
    button.innerHTML = '<i class="fas fa-redo"></i>Redo';
    button.dataset.action = 'redoCost';
    button.classList.remove('undo');
    button.classList.add('redo');
  } catch (error) {
    ui.notifications.error(`Failed to undo cost: ${error.message}`);
  }
}

/**
 * Handle redo healing button clicks
 * Reapplies healing that was undone
 * @param {Event} event - The click event
 * @param {HTMLElement} button - The button that was clicked
 * @private
 */
async function onRedoHealingClick(event, button) {
  event.preventDefault();

  const targetId = button.dataset.targetId;
  const amount = parseInt(button.dataset.amount);
  const resource = button.dataset.resource;

  if (!amount || amount <= 0) {
    ui.notifications.warn('No healing to redo');
    return;
  }

  try {
    const targetActor = _findTargetActor(targetId);
    if (!targetActor) {
      ui.notifications.error('Target actor not found');
      return;
    }

    // Reapply the healing
    await targetActor.applyHealing(amount, resource, {
      suppressChat: true,
    });
    ui.notifications.info(
      `Reapplied ${amount} ${resource.toUpperCase()} healing to ${
        targetActor.name
      }`
    );

    // Replace redo button with undo button
    button.innerHTML = '<i class="fas fa-undo"></i>Undo';
    button.dataset.action = 'undoHealing';
    button.classList.remove('redo');
    button.classList.add('undo');
  } catch (error) {
    ui.notifications.error(`Failed to redo healing: ${error.message}`);
  }
}

/**
 * Handle redo cost button clicks (re-pay cost after it was undone)
 * @param {Event} event - The click event
 * @param {HTMLElement} button - The button that was clicked
 * @private
 */
async function onRedoCostClick(event, button) {
  event.preventDefault();

  const targetId = button.dataset.targetId;
  const amount = parseInt(button.dataset.amount);
  const resource = button.dataset.resource;

  if (!amount || amount <= 0) {
    ui.notifications.warn('No cost to redo');
    return;
  }

  try {
    const targetActor = _findTargetActor(targetId);
    if (!targetActor) {
      ui.notifications.error('Target actor not found');
      return;
    }

    // Re-apply the cost by applying damage
    await targetActor.applyDamage(amount, 'none', resource, {
      suppressChat: true,
    });

    ui.notifications.info(
      `Re-paid ${amount} ${resource.toUpperCase()} for ${targetActor.name}`
    );

    // Replace redo button with undo button
    button.innerHTML = '<i class="fas fa-undo"></i>Undo';
    button.dataset.action = 'undoCost';
    button.classList.remove('redo');
    button.classList.add('undo');
  } catch (error) {
    ui.notifications.error(`Failed to redo cost: ${error.message}`);
  }
}

/**
 * Handle edit healing button clicks
 * Opens the healing edit dialog for retroactive modification
 * @param {Event} event - The click event
 * @param {HTMLElement} button - The button that was clicked
 * @private
 */
async function onEditHealingClick(event, button) {
  event.preventDefault();

  const targetId = button.dataset.targetId;

  try {
    const targetActor = _findTargetActor(targetId);
    if (!targetActor) {
      ui.notifications.error('Target actor not found');
      return;
    }

    // Get healing application data from the chat message
    const chatMessage = button.closest('.message-content')?.closest('.message');
    if (!chatMessage) {
      ui.notifications.error('Could not find healing data');
      return;
    }

    const messageData = game.messages.get(chatMessage.dataset.messageId);
    const healingApplication = messageData?.flags?.dasu?.healingApplication;
    const sourceItemData = messageData?.flags?.dasu?.sourceItem;

    if (!healingApplication || !sourceItemData) {
      ui.notifications.error('Healing data not found in message');
      return;
    }

    // Find the source actor and item
    const sourceActor = game.actors.contents.find((a) =>
      a.items.find((i) => i.id === sourceItemData.id)
    );
    const sourceItem = sourceActor?.items.get(sourceItemData.id);

    if (!sourceItem) {
      ui.notifications.error('Source healing item not found');
      return;
    }

    // Open the healing edit dialog
    const result = await HealingEditDialog.create({
      targetActor: targetActor,
      sourceActor: sourceActor,
      sourceItem: sourceItem,
      originalHealing: healingApplication.appliedHealing,
      originalResourceTarget: healingApplication.healingType,
      healType: healingApplication.healingType,
      originalMessageId: chatMessage.dataset.messageId, // Pass message ID for updating
    });

    if (result?.applied) {
      // Disable the edit button to prevent confusion
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-check"></i>Edited';

      ui.notifications.info('Healing successfully updated');
    }
  } catch (error) {
    ui.notifications.error(
      `Failed to open healing edit dialog: ${error.message}`
    );
  }
}

/**
 * Find target actor by ID (handles both linked and unlinked tokens)
 * @param {string} targetId - Target actor ID
 * @returns {Actor|null} The target actor or null if not found
 * @private
 */
function _findTargetActor(targetId) {
  // Get the target actor (handle both linked and unlinked tokens)
  let targetActor;
  const token = game.canvas?.tokens?.placeables.find(
    (t) => t.actor?.id === targetId
  );
  if (token && !token.document.actorLink) {
    targetActor = token.actor; // Unlinked token
  } else {
    targetActor = game.actors.get(targetId); // Linked actor
  }

  return targetActor;
}

/**
 * Initialize healing event handlers
 * Sets up event delegation for healing-related buttons in chat messages
 *
 * Handles the following actions:
 * - applySelf: Apply healing to the source actor
 * - applyTargeted: Apply healing to currently targeted tokens
 * - undoHealing: Reverse previously applied healing
 * - editHealing: Open edit dialog (placeholder)
 *
 * @public
 */
export function initializeHealingEventHandlers() {
  // Add event delegation specifically for healing buttons to avoid conflicts with damage handlers
  document.addEventListener('click', _handleHealingButtonClick);
}

/**
 * Handle click events on healing-related buttons
 * Uses event delegation to handle all healing button clicks
 * @param {Event} event - The click event
 * @private
 */
function _handleHealingButtonClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const action = button.dataset.action;

  // Route to appropriate handler based on action
  switch (action) {
    case 'applySelf':
    case 'applyTargeted':
      // Legacy healing prep buttons - only handle within healing containers
      const healingContainer = event.target.closest(
        '.dasu.healing-prep, .dasu.healing-applied'
      );
      if (healingContainer) {
        onHealingButtonClick(event, button);
      }
      break;
    case 'applyHealing':
      // Individual target healing from targeted individuals
      onTargetedHealingClick(event, button);
      break;
    case 'applyTargetedHealing':
      // Apply healing to all targeted individuals
      onApplyTargetedHealingClick(event, button);
      break;
    case 'undoHealing':
      onUndoHealingClick(event, button);
      break;
    case 'undoCost':
      onUndoCostClick(event, button);
      break;
    case 'redoHealing':
      onRedoHealingClick(event, button);
      break;
    case 'redoCost':
      onRedoCostClick(event, button);
      break;
    case 'editHealing':
      onEditHealingClick(event, button);
      break;
    default:
      // Not a healing action, ignore
      break;
  }
}
