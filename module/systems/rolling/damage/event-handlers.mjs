/**
 * Event Handlers for Damage System
 * Handles click events for damage application and UI interactions.
 */

import { DamageProcessor } from './processor.mjs';
import { DamageEditDialog } from '../../../ui/dialogs/damage-edit-dialog.mjs';

/* global canvas, fromUuidSync */

/**
 * Damage event handler management
 */
export class DamageEventHandlers {
  /**
   * Initialize event handlers for damage pipeline
   */
  static initialize() {
    this._setupTargetedIndividualsHandlers();
    this._setupDamageResultHandlers();
    this._setupDamageMessageHandlers();
  }

  /**
   * Setup event handlers for targeted individuals damage buttons
   * @private
   */
  static _setupTargetedIndividualsHandlers() {
    // Individual target damage - handle both normal and Ctrl+click
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action="applyDamage"]');
      if (!button) return;

      const actorId = button.dataset.actorId;
      const tokenId = button.dataset.tokenId;
      const result = button.dataset.result; // hit, miss, crit, fumble

      try {
        // Extract damage info from parent chat message
        const chatMessage = button.closest('.message-content');
        const weaponData = this._extractWeaponData(chatMessage);

        if (!weaponData) {
          ui.notifications.warn(
            'Could not extract weapon data from chat message'
          );
          return;
        }

        const damageConfig = {
          ...weaponData,
          targets: [{ actorId, tokenId, result }],
          modifiers: { isCritical: result === 'crit' },
        };

        if (event.ctrlKey) {
          // Ctrl+click: TODO - Open customization dialog (not implemented yet)
          ui.notifications.info('Damage customization not yet implemented');
          return;
        } else {
          // Normal click: Direct damage application
          await DamageProcessor.applyDamage(damageConfig);
        }
      } catch (error) {
        ui.notifications.error('Failed to apply damage');
      }
    });

    // Bulk apply all targets - handle both normal and Ctrl+click
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action="applyTargeted"]');
      if (!button) return;

      try {
        const targetsSection = button.closest('.dasu.roll-card.targets');
        const allTargets = Array.from(
          targetsSection.querySelectorAll('[data-action="applyDamage"]')
        ).map((btn) => ({
          actorId: btn.dataset.actorId,
          tokenId: btn.dataset.tokenId,
          result: btn.dataset.result,
        }));

        if (allTargets.length === 0) {
          ui.notifications.warn('No targets found to apply damage to');
          return;
        }

        const weaponData = this._extractWeaponData(targetsSection);

        if (!weaponData) {
          ui.notifications.warn(
            'Could not extract weapon data from chat message'
          );
          return;
        }

        const damageConfig = {
          ...weaponData,
          targets: allTargets,
          modifiers: {}, // Ensure modifiers object exists
        };

        if (event.ctrlKey) {
          // Ctrl+click: TODO - Open customization dialog (not implemented yet)
          ui.notifications.info('Damage customization not yet implemented');
          return;
        } else {
          // Normal click: Direct bulk damage application
          await DamageProcessor.applyDamage(damageConfig);
        }
      } catch (error) {
        ui.notifications.error('Failed to apply damage to targets');
      }
    });
  }

  /**
   * Extract weapon and source data from chat message
   * @param {HTMLElement} chatElement - Chat message element
   * @returns {Object|null} Extracted weapon data or null if not found
   * @private
   */
  static _extractWeaponData(chatElement) {
    try {
      // Get the chat message object
      const messageId = chatElement.closest('.message').dataset.messageId;
      const message = game.messages.get(messageId);

      if (!message || !message.flags?.dasu?.checkResult) {
        return null;
      }

      const checkResult = message.flags.dasu.checkResult;

      // Extract source actor
      const sourceActor = checkResult.actorUuid
        ? fromUuidSync(checkResult.actorUuid)
        : null;

      if (!sourceActor) {
        return null;
      }

      // Extract source item if available
      const sourceItem = checkResult.itemUuid
        ? fromUuidSync(checkResult.itemUuid)
        : null;

      // Determine damage type from item or default to physical
      let damageType = 'physical';
      if (sourceItem?.system?.damageType) {
        damageType = sourceItem.system.damageType;
      }

      // Determine resource target based on item type
      let resourceTarget = 'hp'; // Default to HP damage
      if (sourceItem?.type === 'tactic') {
        resourceTarget = 'wp'; // Tactics target WP
      }

      return {
        source: {
          actor: sourceActor,
          item: sourceItem,
        },
        damageType: damageType,
        resourceTarget: resourceTarget,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Setup handlers for damage result chat messages
   * @private
   */
  static _setupDamageResultHandlers() {
    // Edit damage button
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action="editDamageResult"]');
      if (!button) return;

      const targetId = button.dataset.targetId;

      try {
        const messageId = button.closest('.message').dataset.messageId;
        const message = game.messages.get(messageId);

        if (!message?.flags?.dasu?.damageData) {
          ui.notifications.error('Could not find damage data');
          return;
        }

        const damageData = message.flags.dasu.damageData;
        const targetData = damageData.targets.find(
          (t) => t.actorId === targetId
        );

        if (!targetData) {
          ui.notifications.error('Could not find target data');
          return;
        }

        // TODO: Reopen customization dialog for this target (not implemented)
        ui.notifications.info('Result editing not yet implemented');
      } catch (error) {
        ui.notifications.error('Failed to edit damage');
      }
    });
  }

  /**
   * Setup handlers for damage chat message buttons (undo, edit)
   * @private
   */
  static _setupDamageMessageHandlers() {
    // Undo damage button
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action="undoDamage"]');
      if (!button) return;

      const targetId = button.dataset.targetId;
      const amount = parseInt(button.dataset.amount);
      const tempDepleted = parseInt(button.dataset.tempDepleted) || 0;
      const actualDamage = parseInt(button.dataset.actualDamage) || amount;
      const resource = button.dataset.resource;
      const isHealing = button.dataset.isHealing === 'true';

      try {
        // Get the target actor (handle both linked and unlinked tokens)
        let targetActor;
        const token = canvas.tokens?.placeables.find(
          (t) => t.actor?.id === targetId
        );
        if (token && !token.document.actorLink) {
          targetActor = token.actor; // Unlinked token
        } else {
          targetActor = game.actors.get(targetId); // Linked actor
        }

        if (!targetActor) {
          ui.notifications.error('Target actor not found');
          return;
        }

        // Reverse the damage/healing
        if (isHealing) {
          // Undo healing by applying damage
          await targetActor.applyDamage(amount, 'none', resource, {
            suppressChat: true,
          });
          ui.notifications.info(
            `Undid ${amount} ${resource.toUpperCase()} healing for ${
              targetActor.name
            }`
          );
        } else {
          // Undo damage: restore temp HP first, then regular HP
          if (tempDepleted > 0) {
            await targetActor.addTempHP(tempDepleted, resource);
          }
          if (actualDamage > 0) {
            await targetActor.applyHealing(actualDamage, resource, {
              suppressChat: true,
            });
          }
          ui.notifications.info(
            `Undid ${amount} ${resource.toUpperCase()} damage for ${
              targetActor.name
            }`
          );
        }

        // Replace undo button with redo button
        button.innerHTML = '<i class="fas fa-redo"></i>Redo';
        button.dataset.action = 'redoDamage';
        button.classList.remove('undo');
        button.classList.add('redo');
      } catch (error) {
        ui.notifications.error('Failed to undo damage');
      }
    });

    // Redo damage button
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action="redoDamage"]');
      if (!button) return;

      const targetId = button.dataset.targetId;
      const amount = parseInt(button.dataset.amount);
      const tempDepleted = parseInt(button.dataset.tempDepleted) || 0;
      const actualDamage = parseInt(button.dataset.actualDamage) || amount;
      const resource = button.dataset.resource;
      const isHealing = button.dataset.isHealing === 'true';

      try {
        // Get the target actor (handle both linked and unlinked tokens)
        let targetActor;
        const token = canvas.tokens?.placeables.find(
          (t) => t.actor?.id === targetId
        );
        if (token && !token.document.actorLink) {
          targetActor = token.actor; // Unlinked token
        } else {
          targetActor = game.actors.get(targetId); // Linked actor
        }

        if (!targetActor) {
          ui.notifications.error('Target actor not found');
          return;
        }

        // Reapply the damage/healing
        if (isHealing) {
          // Redo healing
          await targetActor.applyHealing(amount, resource, {
            suppressChat: true,
          });
          ui.notifications.info(
            `Reapplied ${amount} ${resource.toUpperCase()} healing to ${
              targetActor.name
            }`
          );
        } else {
          // Redo damage: remove temp HP first, then apply damage to regular HP
          // This simulates the same flow as the original damage
          if (tempDepleted > 0) {
            const currentTemp = targetActor.system.stats[resource].temp || 0;
            if (currentTemp >= tempDepleted) {
              // Remove the temp HP that was restored during undo
              await targetActor.update({
                [`system.stats.${resource}.temp`]: currentTemp - tempDepleted,
              });
            }
          }
          if (actualDamage > 0) {
            await targetActor.applyDamage(actualDamage, 'none', resource, {
              suppressChat: true,
            });
          }
          ui.notifications.info(
            `Reapplied ${amount} ${resource.toUpperCase()} damage to ${
              targetActor.name
            }`
          );
        }

        // Replace redo button with undo button
        button.innerHTML = '<i class="fas fa-undo"></i>Undo';
        button.dataset.action = 'undoDamage';
        button.classList.remove('redo');
        button.classList.add('undo');
      } catch (error) {
        ui.notifications.error('Failed to redo damage');
      }
    });

    // Edit damage button
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action="editDamage"]');
      if (!button) return;

      const targetId = button.dataset.targetId;

      try {
        // Get the target actor (handle both linked and unlinked tokens)
        let targetActor;
        const token = canvas.tokens?.placeables.find(
          (t) => t.actor?.id === targetId
        );
        if (token && !token.document.actorLink) {
          targetActor = token.actor; // Unlinked token
        } else {
          targetActor = game.actors.get(targetId); // Linked actor
        }

        if (!targetActor) {
          ui.notifications.error('Target actor not found');
          return;
        }

        // Try to extract source information from the chat message
        const chatMessage = button.closest('.message');
        const messageId = chatMessage?.dataset.messageId;
        let sourceActor = null;
        let sourceItem = null;
        let originalDamage = 0;
        let damageType = 'physical';
        let resourceTarget = 'hp';

        // Try to get source info from message flags if available
        let isCritical = false;
        if (messageId) {
          const message = game.messages.get(messageId);
          if (message?.flags?.dasu) {
            // Extract from damage source if available
            const damageSource = message.flags.dasu.damageSource;
            const damageResult = message.flags.dasu.damageResult;
            if (damageSource) {
              sourceActor = game.actors.get(damageSource.actorId);
              sourceItem = sourceActor?.items.get(damageSource.itemId);
              damageType = damageSource.damageType || 'physical';
              resourceTarget = damageSource.resourceTarget || 'hp';
            }
            if (damageResult) {
              originalDamage =
                damageResult.appliedDamage || damageResult.finalDamage || 0;
              isCritical = damageResult.wasCritical || false;
            }
          }
        }

        // Fallback to current user's selected actor
        if (!sourceActor) {
          sourceActor =
            game.user.character ||
            game.actors
              .filter((a) => a.isOwner)
              .find((a) => a.type === 'summoner');
        }

        // Extract original damage from button data or message content
        const damageAmountMatch = button
          .closest('.damage-applied-content')
          ?.querySelector('.damage-amount')?.textContent;
        if (damageAmountMatch) {
          originalDamage = parseInt(damageAmountMatch) || 0;
        }

        // Extract resource target from message content
        const resourceMatch = button
          .closest('.damage-applied-content')
          ?.textContent.match(/(HP|WP|BOTH)/i);
        if (resourceMatch) {
          resourceTarget = resourceMatch[1].toLowerCase();
        }

        // Create and show the dialog
        try {
          await DamageEditDialog.create({
            targetActor,
            sourceActor,
            sourceItem,
            originalDamage,
            damageType,
            originalResourceTarget: resourceTarget,
            originalMessageId: messageId, // Pass message ID for updating
            isCritical: isCritical,
          });
        } catch (error) {
          ui.notifications.error('Failed to process damage edit dialog');
        }
      } catch (error) {
        ui.notifications.error('Failed to open damage editing dialog');
      }
    });
  }
}
