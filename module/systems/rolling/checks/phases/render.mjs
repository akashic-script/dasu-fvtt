/**
 * Rendering Phase Implementation
 * Handles chat message creation and template rendering using the hook system
 */

import { TemplateUtils } from '../utils/templates.mjs';

/**
 * Handles the final phase of check processing - rendering chat messages
 */
export class RenderPhase {
  /**
   * Render check results as a chat message
   * @param {Array} sections - Template sections from hooks
   * @param {Object} result - The processed check result
   * @param {Actor} actor - The actor making the check
   * @param {Item} [item] - Optional item being used
   * @param {Object} [additionalFlags={}] - Additional flags for the chat message
   * @returns {Promise<ChatMessage>} The created chat message
   */
  static async render(sections, result, actor, item, additionalFlags = {}) {
    // Use hook-provided sections
    const allSections = [...sections];

    // Sort sections by order
    allSections.sort((a, b) => (a.order || 0) - (b.order || 0));

    // Render all sections
    const renderedSections = await Promise.all(
      allSections.map((section) => TemplateUtils.renderSection(section))
    );

    // Assemble final content
    const content = renderedSections.join('');

    // Create chat message
    const chatData = {
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
      rolls: result.roll ? [result.roll, ...result.additionalRolls] : [],
      rollMode: game.settings.get('core', 'rollMode'),
      flags: {
        dasu: {
          rollType: 'checks',
          checkType: result.type,
          actorId: actor.id,
          itemId: item?.id || null,
          checkResult: result,
          ...additionalFlags,
        },
      },
    };

    return await ChatMessage.create(chatData);
  }
}
