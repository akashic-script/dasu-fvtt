/**
 * DASU Checks System - Main API Export
 *
 * Provides the unified interface for the DASU check system, supporting:
 * - Attribute checks (dice pool)
 * - Skill checks (dice pool)
 * - Accuracy checks (2d6)
 * - Initiative checks (2d6)
 * - Display checks (non-rolling)
 *
 * @example
 * // Make an attribute check
 * await Checks.attributeCheck(actor, ['pow', 'dex']);
 *
 * // Make a weapon accuracy check
 * await Checks.accuracyCheck(actor, weapon);
 *
 * // Display an item
 * await Checks.display(actor, tag);
 */

import { ChecksPipeline } from './checks/core/pipeline.mjs';
import { D6Check } from './checks/d6-check.mjs';
import { AttributeCheck } from './checks/attribute-check.mjs';
import { DisplayCheck } from './checks/display-check.mjs';
import { TargetedIndividuals } from './checks/targeted-individuals.mjs';
import { TargetedProcessing } from './checks/targeted-processing.mjs';
import { Retarget } from './retarget.mjs';
import { contextMenu } from './context-menu.mjs';
import { initializeDamageSystem } from './damage/index.mjs';
import { initializeHealingEventHandlers } from './healing/event-handlers.mjs';

// Create singleton pipeline instance
const pipeline = new ChecksPipeline();

/**
 * Main Checks API object
 * @namespace
 */
export const Checks = {
  // Main API methods
  /** @see ChecksPipeline#attributeCheck */
  attributeCheck: pipeline.attributeCheck.bind(pipeline),
  /** @see ChecksPipeline#skillCheck */
  skillCheck: pipeline.skillCheck.bind(pipeline),
  /** @see ChecksPipeline#accuracyCheck */
  accuracyCheck: pipeline.accuracyCheck.bind(pipeline),
  /** @see ChecksPipeline#initiativeCheck */
  initiativeCheck: pipeline.initiativeCheck.bind(pipeline),
  /** @see ChecksPipeline#displayCheck */
  displayCheck: pipeline.displayCheck.bind(pipeline),

  /**
   * Utility method for displaying items without rolling
   * @param {Actor} actor - The actor displaying the item
   * @param {Item} item - The item to display
   * @param {Object} [data={}] - Additional data to include
   * @returns {Promise<ChatMessage>} The created chat message
   */
  display: async (actor, item, data = {}) => {
    const check = await pipeline.prepareCheck('display', {
      actor,
      item,
      ...data,
    });
    const result = await pipeline.processCheck(check, actor, item);
    return await pipeline.renderCheck(result, actor, item);
  },

  /**
   * Modify an existing check result and re-render
   * @param {string} checkId - The ID of the check to modify
   * @param {Function} callback - Function that receives (checkResult, actor, item) and returns modification
   * @returns {Promise<ChatMessage|null>} New chat message or null if no modification
   */
  modifyCheck: async (checkId, callback) => {
    // Find existing check result in chat messages
    const message = game.messages.find(
      (m) => m.flags?.dasu?.checkResult?.id === checkId
    );

    if (!message) {
      throw new Error(`Check with ID ${checkId} not found`);
    }

    const checkResult = message.flags.dasu.checkResult;
    const actor = game.actors.get(checkResult.actorUuid.split('.')[1]);
    const item = checkResult.itemUuid
      ? actor?.items.get(checkResult.itemUuid.split('.')[3])
      : null;

    // Apply modification
    const modification = await callback(checkResult, actor, item);

    if (modification) {
      // Create new check with modifications
      const newCheck = modification.check;
      const newResult = await pipeline.processCheck(newCheck, actor, item);
      return await pipeline.renderCheck(newResult, actor, item);
    }

    return null;
  },

  /**
   * Check if a message or message ID is a DASU check
   * @param {ChatMessage|string} message - The message object or message ID
   * @returns {boolean} True if the message is a DASU check
   */
  isCheck: (message) => {
    if (typeof message === 'string') {
      const chatMessage = game.messages.get(message);
      return !!chatMessage?.flags?.dasu?.checkResult;
    }
    return !!message?.flags?.dasu?.checkResult;
  },

  /**
   * Context menu management for check messages
   * @namespace
   */
  contextMenu: {
    /**
     * Register a context menu option for check messages
     * @param {string} id - Unique identifier for the option
     * @param {ContextMenuOption} option - The context menu option configuration
     */
    registerOption: (id, option) => contextMenu.registerOption(id, option),

    /**
     * Unregister a context menu option
     * @param {string} id - The option ID to remove
     */
    unregisterOption: (id) => contextMenu.unregisterOption(id),

    /**
     * Get all registered context menu options
     * @returns {Array<{id: string, option: ContextMenuOption}>}
     */
    getOptions: () => contextMenu.getOrderedOptions(),
  },
};

// Initialize check modules
D6Check.initialize();
AttributeCheck.initialize();
DisplayCheck.initialize();
TargetedIndividuals.initialize();
TargetedProcessing.initialize();

// Initialize context menu framework
contextMenu.initialize();

// Initialize retarget module (uses context menu framework)
Retarget.initialize();

// Initialize damage system
initializeDamageSystem();

// Initialize healing system
initializeHealingEventHandlers();

// Default export
export default Checks;
