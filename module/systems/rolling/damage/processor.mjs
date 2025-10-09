/**
 * Damage Processing System for DASU
 * Handles damage application with resistance calculations, token resolution, and chat messages.
 */

import { DamageCalculator } from './core/calculator.mjs';

/* global canvas, CONST */
export class DamageProcessor {
  /**
   * Apply damage from a targeted check to one or more actors
   * @param {Object} damageConfig - Damage configuration
   * @param {Object} damageConfig.source - Source information
   * @param {Actor} damageConfig.source.actor - Source actor
   * @param {Item} [damageConfig.source.item] - Source item/weapon
   * @param {Array} damageConfig.targets - Target information array
   * @param {string} [damageConfig.damageType='physical'] - Type of damage
   * @param {string} [damageConfig.resourceTarget='hp'] - Target resource
   * @param {Object} [damageConfig.modifiers={}] - Damage modifiers
   * @param {string} [damageConfig.flavor] - Custom flavor text for chat message
   * @returns {Promise<Array>} Array of damage results
   */
  static async applyDamage(damageConfig) {
    const {
      source,
      targets,
      damageType = 'physical',
      resourceTarget = 'hp',
      modifiers = {},
      flavor = null,
    } = damageConfig;

    if (!source?.actor || !targets?.length) {
      throw new Error('Source actor and targets are required');
    }

    const results = [];

    // Calculate base damage once
    let baseDamage;
    try {
      baseDamage = DamageCalculator.calculateBaseDamage(
        source.actor,
        source.item,
        modifiers
      );
    } catch (error) {
      baseDamage = 0;
    }

    // Process each target
    for (const targetData of targets) {
      let targetActor;

      // For unlinked tokens, get the token's actor instead of the prototype
      if (targetData.tokenId) {
        const token = canvas.tokens?.get(targetData.tokenId);
        if (token && !token.document.actorLink) {
          // Unlinked token - use the token's actor data
          targetActor = token.actor;
        } else if (token) {
          // Linked token - use the linked actor
          targetActor = token.actor;
        }
      }

      // Fallback to getting actor by ID if token method didn't work
      if (!targetActor) {
        targetActor = game.actors.get(targetData.actorId);
      }

      if (!targetActor) {
        continue;
      }

      // Calculate final damage for this target
      let finalDamage = baseDamage;
      let resistanceResult = null;
      const isCritical = modifiers.isCritical || targetData.result === 'crit';

      // Check for miss - if miss, damage is 0
      if (targetData.result === 'miss') {
        finalDamage = 0;
      } else {
        // Apply resistance (which handles crit multiplier for weak resistance)
        if (!modifiers.ignoreResistance) {
          resistanceResult = DamageCalculator.applyResistance(
            finalDamage,
            targetActor,
            damageType,
            isCritical
          );
          finalDamage = resistanceResult.damage;
        } else if (isCritical) {
          // If ignoring resistance, still apply crit multiplier
          finalDamage *= 2;
        }

        // Apply bonus damage
        finalDamage += modifiers.bonus || 0;

        // Apply multiplier
        finalDamage *= modifiers.multiplier || 1;
      }

      // Ensure minimum damage of 0
      finalDamage = Math.max(0, Math.floor(finalDamage));

      // Apply the damage directly using the actor's method
      let damageResult;
      if (resistanceResult?.isHealing) {
        damageResult = await targetActor.applyHealing(
          finalDamage,
          resourceTarget,
          { suppressChat: true } // We'll create our own chat message
        );
      } else {
        damageResult = await targetActor.applyDamage(
          finalDamage,
          damageType,
          resourceTarget,
          { suppressChat: true } // We'll create our own chat message
        );
      }

      // Create result object
      const result = {
        targetId: targetActor.id,
        tokenId: targetData.tokenId || null, // Track token ID for unlinked tokens
        targetName: targetActor.name,
        targetImg: targetActor.img,
        originalDamage: baseDamage,
        finalDamage: finalDamage,
        appliedDamage: damageResult.applied,
        tempDepleted: damageResult.tempDepleted || 0,
        actualDamage: damageResult.actualDamage || damageResult.applied,
        damageType: damageType,
        resourceTarget: resourceTarget,
        hitResult: targetData.result,
        wasCritical: isCritical,
        isHealing: resistanceResult?.isHealing || false,
        resistance: resistanceResult || {
          value: 0,
          type: 'normal',
          multiplier: 1,
        },
      };

      results.push(result);

      // Create individual compact chat message for this target
      await this._createIndividualDamageMessage(result, source, flavor);
    }

    return results;
  }

  /**
   * Create an individual compact chat message for a single target's damage
   * @param {Object} result - Single target damage result
   * @param {Object} source - Source information
   * @param {string} [customFlavor] - Custom flavor text
   * @private
   */
  static async _createIndividualDamageMessage(
    result,
    source,
    customFlavor = null
  ) {
    const damageText = result.isHealing ? 'healed' : 'damaged';
    const icon = result.isHealing ? '♥' : '⚔';

    // Build CSS classes
    const cssClasses = ['dasu', 'damage-applied'];
    if (result.isHealing) cssClasses.push('healing');
    if (result.wasCritical) cssClasses.push('critical');

    // Build target attributes (include token ID for unlinked tokens)
    const targetAttrs = `data-actor-id="${result.targetId}"${
      result.tokenId ? ` data-token-id="${result.tokenId}"` : ''
    }`;

    // Build modifiers text
    const modifiers = [];
    if (result.wasCritical) modifiers.push('Critical!');
    if (result.resistance.type !== 'normal')
      modifiers.push(result.resistance.type);
    const modifiersText =
      modifiers.length > 0
        ? ` <span class="damage-modifiers">(${modifiers.join(', ')})</span>`
        : '';

    // Build source item text
    const sourceItemText = source.item
      ? ` from <span class="source-item">${source.item.name}</span>`
      : '';

    // Build damage display text
    let damageDisplayText = '';
    const tempDepleted = result.tempDepleted || 0;
    const actualDamage = result.actualDamage || result.appliedDamage;

    if (tempDepleted > 0 && actualDamage > 0) {
      // Both temp and regular damage
      damageDisplayText = `<span class="damage-amount temp">${tempDepleted}</span> temp + <span class="damage-amount">${actualDamage}</span> ${result.resourceTarget.toUpperCase()}`;
    } else if (tempDepleted > 0) {
      // Only temp damage
      damageDisplayText = `<span class="damage-amount temp">${tempDepleted}</span> temp ${result.resourceTarget.toUpperCase()}`;
    } else {
      // Only regular damage
      damageDisplayText = `<span class="damage-amount">${
        result.appliedDamage
      }</span> ${result.resourceTarget.toUpperCase()}`;
    }

    // Build action buttons
    const editButton = source.item
      ? `<button class="damage-action-btn edit" data-action="editDamage" data-target-id="${result.targetId}">
           <i class="fas fa-edit"></i>Edit
         </button>`
      : '';

    // Build complete message content
    const content = `
      <div class="${cssClasses.join(' ')}">
        <div class="damage-applied-content">
          <div class="damage-text">
            <span class="damage-icon">${icon}</span>
            <span class="target-name clickable" ${targetAttrs}>${
      result.targetName
    }</span> ${damageText} for
            ${damageDisplayText}${sourceItemText}${modifiersText}
          </div>
          <div class="damage-actions">
            <button class="damage-action-btn undo" data-action="undoDamage" data-target-id="${
              result.targetId
            }" data-amount="${result.appliedDamage}" data-temp-depleted="${
      result.tempDepleted || 0
    }" data-actual-damage="${
      result.actualDamage || result.appliedDamage
    }" data-resource="${result.resourceTarget}" data-is-healing="${
      result.isHealing
    }">
              <i class="fas fa-undo"></i>Undo
            </button>
            ${editButton}
          </div>
        </div>
      </div>
    `;

    // Create chat message
    await ChatMessage.create({
      content,
      speaker: ChatMessage.getSpeaker({ actor: source.actor }),
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      flavor: customFlavor || `${result.damageType} damage applied`,
      flags: {
        dasu: {
          damageResult: result,
          damageSource: {
            actorId: source.actor.id,
            itemId: source.item?.id,
            damageType: result.damageType,
            resourceTarget: result.resourceTarget,
          },
        },
      },
    });
  }

  /**
   * Quick damage application - simplified interface for common use cases
   * @param {string} targetId - Target actor ID or token ID
   * @param {number} damage - Damage amount
   * @param {string} damageType - Type of damage
   * @param {string} resourceTarget - Target resource
   * @param {string} [tokenId] - Optional token ID for unlinked tokens
   * @returns {Promise<Object>} Damage result
   */
  static async quickDamage(
    targetId,
    damage,
    damageType = 'physical',
    resourceTarget = 'hp',
    tokenId = null
  ) {
    let targetActor;

    // Try to get token actor first if tokenId provided
    if (tokenId) {
      const token = canvas.tokens?.get(tokenId);
      if (token) {
        targetActor = token.actor;
      }
    }

    // Fallback to actor by ID
    if (!targetActor) {
      targetActor = game.actors.get(targetId);
    }

    if (!targetActor) {
      throw new Error(`Target actor ${targetId} not found`);
    }

    return await targetActor.applyDamage(damage, damageType, resourceTarget);
  }

  /**
   * Quick healing application - simplified interface for common use cases
   * @param {string} targetId - Target actor ID or token ID
   * @param {number} healing - Healing amount
   * @param {string} resourceTarget - Target resource
   * @param {string} [tokenId] - Optional token ID for unlinked tokens
   * @returns {Promise<Object>} Healing result
   */
  static async quickHealing(
    targetId,
    healing,
    resourceTarget = 'hp',
    tokenId = null
  ) {
    let targetActor;

    // Try to get token actor first if tokenId provided
    if (tokenId) {
      const token = canvas.tokens?.get(tokenId);
      if (token) {
        targetActor = token.actor;
      }
    }

    // Fallback to actor by ID
    if (!targetActor) {
      targetActor = game.actors.get(targetId);
    }

    if (!targetActor) {
      throw new Error(`Target actor ${targetId} not found`);
    }

    return await targetActor.applyHealing(healing, resourceTarget);
  }
}
