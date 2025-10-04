/**
 * Core Damage Pipeline Implementation
 *
 * Implements the three-phase damage system architecture:
 * 1. Initiate: Initialize damage data and allow user modifications
 * 2. Process: Execute damage calculations and resistance checks
 * 3. Render: Generate chat messages with damage results
 *
 * @example
 * // Direct damage application
 * await DamagePipeline.process({
 *   source: { actor: sourceActor, item: weapon },
 *   targets: [{ actorId, tokenId, result: 'hit' }],
 *   damageType: 'fire'
 * });
 *
 * // Damage with customization dialog
 * await DamagePipeline.initiate({
 *   source: { actor: sourceActor, item: weapon },
 *   targets: [{ actorId, tokenId, result: 'hit' }],
 *   showCustomization: true
 * });
 */

import { DamageCalculator } from './calculator.mjs';
import { DamageHooks } from './hooks.mjs';

/**
 * Main pipeline class that orchestrates the three-phase damage system
 */
export class DamagePipeline {
  /**
   * Initialize static hooks system
   */
  static hooks = new DamageHooks();

  /**
   * Phase 1: Initiate - Initialize damage data and show customization dialog if requested
   * @param {Object} damageData - Initial damage configuration
   * @param {Object} damageData.source - Source actor and item information
   * @param {Actor} damageData.source.actor - The actor dealing damage
   * @param {Item} [damageData.source.item] - The weapon/item used
   * @param {Array} damageData.targets - Array of target information
   * @param {string} [damageData.damageType='physical'] - Type of damage being dealt
   * @param {string} [damageData.resourceTarget='hp'] - Target resource (hp, wp, both)
   * @param {Object} [damageData.modifiers={}] - Damage modifiers
   * @param {boolean} [damageData.showCustomization=false] - Whether to show customization dialog
   * @param {string} [damageData.focusTarget] - Actor ID to focus on in customization
   * @returns {Promise<Object|ChatMessage>} Prepared damage data or chat message if processed directly
   */
  static async initiate(damageData) {
    // Validate required data
    if (!damageData.source?.actor) {
      throw new Error('Source actor is required for damage pipeline');
    }
    if (!damageData.targets?.length) {
      throw new Error('At least one target is required for damage pipeline');
    }

    // Prepare damage data
    const preparedData = await this._prepareDamageData(damageData);

    // Execute initiate hooks
    Hooks.call('dasu.initiateDamage', preparedData);

    // Show customization dialog if requested
    if (damageData.showCustomization) {
      return await this._showCustomizationDialog(preparedData);
    }

    // Otherwise proceed directly to processing
    return await this.process(preparedData);
  }

  /**
   * Phase 2: Process - Execute damage calculations and resistance checks
   * @param {Object} damageData - Prepared damage data
   * @returns {Promise<ChatMessage>} The rendered damage results
   */
  static async process(damageData) {
    // Process each target individually
    const results = [];

    for (const targetData of damageData.targets) {
      const targetActor = game.actors.get(targetData.actorId);
      if (!targetActor) continue;

      const targetResult = await this._processTarget(
        damageData,
        targetData,
        targetActor
      );
      results.push(targetResult);

      // Auto-apply damage if not in customization mode
      if (!damageData.showCustomization) {
        await this.applyDamage(targetData.actorId, targetResult);
      }
    }

    // Execute process hooks
    Hooks.call('dasu.processDamage', results, damageData);

    // Proceed to rendering
    return await this.render(results, damageData);
  }

  /**
   * Phase 3: Render - Generate chat messages with damage results
   * @param {Array} results - Array of processed target results
   * @param {Object} damageData - Original damage data
   * @returns {Promise<ChatMessage>} The created chat message
   */
  static async render(results, damageData) {
    // Execute render hooks to allow customization
    const sections = [];
    const additionalFlags = {};

    Hooks.call(
      'dasu.renderDamage',
      sections,
      results,
      damageData,
      additionalFlags
    );

    // Create chat message content
    const content = await this._buildChatContent(results, damageData, sections);

    // Create chat message
    const chatData = {
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: damageData.source.actor }),
      content: content,
      style: foundry.CONST.CHAT_MESSAGE_STYLES.OTHER,
      flags: {
        dasu: {
          damageResults: results,
          damageData: damageData,
          ...additionalFlags,
        },
      },
    };

    const chatMessage = await ChatMessage.create(chatData);

    // Execute post-render hooks
    Hooks.call('dasu.postRenderDamage', chatMessage, results, damageData);

    return chatMessage;
  }

  /**
   * Apply damage to a specific target
   * @param {string} targetId - Actor ID of the target
   * @param {Object} damageResult - Damage result object
   * @returns {Promise<void>}
   */
  static async applyDamage(targetId, damageResult) {
    const target = game.actors.get(targetId);
    if (!target) {
      throw new Error(`Target actor ${targetId} not found`);
    }

    // Handle different data model structures (daemon vs other actors)
    const currentHp =
      target.system.hp?.current ?? target.system.stats?.hp?.current ?? 0;
    const currentWp =
      target.system.wp?.current ?? target.system.stats?.wp?.current ?? 0;
    const maxHp = target.system.hp?.max ?? target.system.stats?.hp?.max ?? 20;
    const maxWp = target.system.wp?.max ?? target.system.stats?.wp?.max ?? 20;

    const updates = {};

    // Apply HP damage/healing
    if (
      damageResult.resourceTarget === 'hp' ||
      damageResult.resourceTarget === 'both'
    ) {
      const newHp = damageResult.isHealing
        ? currentHp + damageResult.finalDamage
        : currentHp - damageResult.finalDamage;

      // Update the correct path based on actor type
      if (target.system.hp?.current !== undefined) {
        updates['system.hp.current'] = Math.max(0, Math.min(newHp, maxHp));
      } else {
        updates['system.stats.hp.current'] = Math.max(
          0,
          Math.min(newHp, maxHp)
        );
      }
    }

    // Apply WP damage/healing
    if (
      damageResult.resourceTarget === 'wp' ||
      damageResult.resourceTarget === 'both'
    ) {
      const newWp = damageResult.isHealing
        ? currentWp + damageResult.finalDamage
        : currentWp - damageResult.finalDamage;

      // Update the correct path based on actor type
      if (target.system.wp?.current !== undefined) {
        updates['system.wp.current'] = Math.max(0, Math.min(newWp, maxWp));
      } else {
        updates['system.stats.wp.current'] = Math.max(
          0,
          Math.min(newWp, maxWp)
        );
      }
    }

    if (Object.keys(updates).length > 0) {
      await target.update(updates);
    }

    // Execute damage application hooks
    Hooks.call('dasu.damageApplied', target, damageResult);
  }

  /**
   * Prepare initial damage data
   * @param {Object} damageData - Raw damage data
   * @returns {Promise<Object>} Prepared damage data
   * @private
   */
  static async _prepareDamageData(damageData) {
    const sourceActor = damageData.source.actor;
    const sourceItem = damageData.source.item;

    // Calculate base damage using DASU formula
    let baseDamage;
    try {
      baseDamage = DamageCalculator.calculateBaseDamage(
        sourceActor,
        sourceItem,
        damageData.modifiers || {}
      );
    } catch (error) {
      baseDamage = 0;
    }

    const preparedData = {
      id: foundry.utils.randomID(),
      timestamp: Date.now(),

      // Source information
      source: {
        actor: sourceActor,
        item: sourceItem,
        powTick: sourceActor.system.attributes.pow.tick || 1,
        weaponDamage: sourceItem?.system.damage?.value || 0,
      },

      // Damage configuration
      baseDamage: baseDamage,
      damageType: damageData.damageType || 'physical',
      resourceTarget: damageData.resourceTarget || 'hp',

      // Target information
      targets: damageData.targets,

      // Modifiers
      modifiers: {
        bonus: 0,
        multiplier: 1,
        isCritical: false,
        ignoreResistance: false,
        ...damageData.modifiers,
      },

      // UI configuration
      showCustomization: damageData.showCustomization || false,
      focusTarget: damageData.focusTarget,
    };

    return preparedData;
  }

  /**
   * Process damage for a single target
   * @param {Object} damageData - Damage configuration
   * @param {Object} targetData - Target information
   * @param {Actor} targetActor - Target actor object
   * @returns {Promise<Object>} Target damage result
   * @private
   */
  static async _processTarget(damageData, targetData, targetActor) {
    // Calculate final damage with modifiers
    let finalDamage = damageData.baseDamage;

    // Ensure modifiers exist
    const modifiers = damageData.modifiers || {};

    // Apply critical hit modifier
    const isCritical = modifiers.isCritical || targetData.result === 'crit';
    if (isCritical) {
      finalDamage *= 2;
    }

    // Apply bonus damage
    finalDamage += modifiers.bonus || 0;

    // Apply multiplier
    finalDamage *= modifiers.multiplier || 1;

    // Apply resistance if not ignored
    let resistanceResult = null;
    if (!modifiers.ignoreResistance) {
      resistanceResult = DamageCalculator.applyResistance(
        finalDamage,
        targetActor,
        damageData.damageType,
        isCritical
      );
      finalDamage = resistanceResult.damage;
    }

    return {
      targetId: targetActor.id,
      targetName: targetActor.name,
      targetImg: targetActor.img,

      originalDamage: damageData.baseDamage,
      finalDamage: Math.max(0, Math.floor(finalDamage)),
      damageType: damageData.damageType,
      resourceTarget: damageData.resourceTarget,

      hitResult: targetData.result,
      wasCritical: isCritical,
      isHealing: resistanceResult?.isHealing || false,

      resistance: resistanceResult || {
        value: 0,
        type: 'normal',
        multiplier: 1,
      },
    };
  }

  /**
   * Show customization dialog for damage configuration
   * @param {Object} damageData - Prepared damage data
   * @returns {Promise<ChatMessage|null>} Chat message if damage was applied, null if cancelled
   * @private
   */
  static async _showCustomizationDialog(damageData) {
    // TODO: Implement DialogV2 customization dialog
    // For now, proceed directly to processing
    return await this.process(damageData);
  }

  /**
   * Build chat message content from damage results
   * @param {Array} results - Target damage results
   * @param {Object} damageData - Original damage data
   * @param {Array} sections - Additional content sections from hooks
   * @returns {Promise<string>} HTML content for chat message
   * @private
   */
  static async _buildChatContent(results, damageData, sections) {
    // Helper functions for template
    const templateHelpers = {
      capitalize: (str) => str.charAt(0).toUpperCase() + str.slice(1),
      concat: (...args) => args.slice(0, -1).join(''),
      eq: (a, b) => a === b,
      ne: (a, b) => a !== b,
      gt: (a, b) => a > b,
      sum: (array, property) =>
        array.reduce((sum, item) => sum + (item[property] || 0), 0),
    };

    // Create basic damage summary content
    const content = await foundry.applications.handlebars.renderTemplate(
      'systems/dasu/templates/chat/damage/damage-results.hbs',
      {
        results: results,
        damageData: damageData,
        sections: sections,
        ...templateHelpers,
      }
    );

    return content;
  }
}
