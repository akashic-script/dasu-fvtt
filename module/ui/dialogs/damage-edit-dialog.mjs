/**
 * Retroactive damage editing dialog
 * Allows modification of damage type, modifiers, and resistance settings.
 */

import { DamageCalculator } from '../../systems/rolling/damage/core/calculator.mjs';
import { markMessageAsEdited } from '../../utils/chat-helpers.mjs';

/* global CONST */

export class DamageEditDialog {
  static async create(options = {}) {
    // Store data
    const targetActor = options.targetActor;
    const targetTokenId = options.tokenId || null; // Track token ID for unlinked tokens
    const sourceActor = options.sourceActor;
    const sourceItem = options.sourceItem;
    const originalDamage = options.originalDamage;
    const originalResourceTarget = options.originalResourceTarget;
    const originalMessageId = options.originalMessageId || null;

    // Default damage data
    const damageData = {
      damageType: options.damageType || 'physical',
      govern:
        options.govern ||
        options.attributeTick ||
        sourceItem?.system?.govern ||
        'pow',
      damageMod: options.damageMod || 0,
      ignoreResist: options.ignoreResist || false,
      ignoreWeak: options.ignoreWeak || false,
      ignoreNullify: options.ignoreNullify || false,
      ignoreDrain: options.ignoreDrain || false,
      resourceTarget: originalResourceTarget || 'hp',
    };

    // Prepare context for template
    const context = {
      targetActor,
      targetTokenId,
      sourceActor,
      sourceItem,
      originalDamage,
      isGM: game.user.isGM,
      currentHp:
        targetActor.system.stats?.hp?.current ??
        targetActor.system.hp?.current ??
        0,
      currentWp:
        targetActor.system.stats?.wp?.current ??
        targetActor.system.wp?.current ??
        0,
      maxHp:
        targetActor.system.stats?.hp?.max ?? targetActor.system.hp?.max ?? 20,
      maxWp:
        targetActor.system.stats?.wp?.max ?? targetActor.system.wp?.max ?? 20,
      damageData,
      previewDamage: this._calculatePreviewDamage(
        targetActor,
        sourceActor,
        sourceItem,
        damageData
      ),
      damageTypes: [
        {
          value: 'physical',
          label: game.i18n.localize('DASU.DAMAGE_TYPES.Physical'),
        },
        { value: 'fire', label: game.i18n.localize('DASU.DAMAGE_TYPES.Fire') },
        { value: 'ice', label: game.i18n.localize('DASU.DAMAGE_TYPES.Ice') },
        {
          value: 'electric',
          label: game.i18n.localize('DASU.DAMAGE_TYPES.Electric'),
        },
        { value: 'wind', label: game.i18n.localize('DASU.DAMAGE_TYPES.Wind') },
        {
          value: 'earth',
          label: game.i18n.localize('DASU.DAMAGE_TYPES.Earth'),
        },
        {
          value: 'light',
          label: game.i18n.localize('DASU.DAMAGE_TYPES.Light'),
        },
        { value: 'dark', label: game.i18n.localize('DASU.DAMAGE_TYPES.Dark') },
      ],
      attributeOptions: [
        {
          value: 'pow',
          label: game.i18n.localize('DASU.Actor.Attributes.list.pow.abbr'),
        },
        {
          value: 'dex',
          label: game.i18n.localize('DASU.Actor.Attributes.list.dex.abbr'),
        },
        {
          value: 'will',
          label: game.i18n.localize('DASU.Actor.Attributes.list.will.abbr'),
        },
        {
          value: 'sta',
          label: game.i18n.localize('DASU.Actor.Attributes.list.sta.abbr'),
        },
      ],
      resourceOptions: [
        { value: 'hp', label: 'HP' },
        { value: 'wp', label: 'WP' },
        {
          value: 'both',
          label: game.i18n.localize('DASU.ResourceTargets.Both'),
        },
      ],
    };

    // Render the content
    const content = await foundry.applications.handlebars.renderTemplate(
      'systems/dasu/templates/dialogs/damage-edit.hbs',
      context
    );

    // Configure DialogV2 options - try using the content directly as HTML
    const dialogOptions = {
      window: {
        title: game.i18n.format('DASU.Damage.EditDialog.Title', {
          name: targetActor.name,
        }),
        classes: ['dasu', 'damage-edit-dialog'],
      },
      position: { width: 400 },
      content: content,
      buttons: [
        {
          action: 'cancel',
          icon: 'fas fa-times',
          label: game.i18n.localize('DASU.Damage.EditDialog.Cancel'),
          callback: () => ({ action: 'cancel' }),
        },
        {
          action: 'apply',
          icon: 'fas fa-check',
          label: game.i18n.localize('DASU.Damage.EditDialog.ApplyChanges'),
          default: true,
          callback: (_, __, dialog) => {
            const form = dialog.element.querySelector('form');
            if (form) {
              const formData = new foundry.applications.ux.FormDataExtended(
                form
              );
              return { action: 'apply', formData: formData.object };
            }
            return { action: 'cancel' };
          },
        },
      ],
      render: (_, dialog) => {
        // Store references for preview updates
        Object.assign(dialog, {
          _damageData: damageData,
          _originalDamage: originalDamage,
          _targetActor: targetActor,
          _targetTokenId: targetTokenId,
          _sourceActor: sourceActor,
          _sourceItem: sourceItem,
        });

        // Setup form change handlers for live preview
        const form = dialog.element.querySelector('form');
        if (form) {
          form.addEventListener('change', () =>
            DamageEditDialog._updatePreview(dialog)
          );
          form.addEventListener('input', (e) => {
            if (e.target.type === 'number')
              DamageEditDialog._updatePreview(dialog);
          });
        }

        // Calculate initial preview
        setTimeout(() => DamageEditDialog._updatePreview(dialog), 50);
      },
      submit: (result) => {
        // Handle submit in a static context
        if (result.action === 'apply') {
          return DamageEditDialog._handleSubmit(
            result,
            targetActor,
            targetTokenId,
            sourceActor,
            sourceItem,
            originalDamage,
            originalResourceTarget,
            damageData,
            originalMessageId
          );
        }
        return { applied: false };
      },
    };

    return foundry.applications.api.DialogV2.wait(dialogOptions);
  }

  /**
   * Update the damage preview in the dialog
   * @param {DialogV2} dialog - The dialog instance
   * @private
   */
  static _updatePreview(dialog) {
    const form = dialog.element.querySelector('form');
    if (!form) return;

    // Get current form data
    const formData = new foundry.applications.ux.FormDataExtended(form);
    const currentData = foundry.utils.mergeObject(
      dialog._damageData,
      formData.object
    );

    // Calculate new preview
    const previewResult = this._calculatePreviewDamage(
      dialog._targetActor,
      dialog._sourceActor,
      dialog._sourceItem,
      currentData
    );

    // Update preview content
    const previewContent = dialog.element.querySelector('.preview-content');
    const previewChange = dialog.element.querySelector('.preview-change');

    if (previewContent) {
      const icon = previewResult.isHealing ? '♥' : '⚔';
      const type = previewResult.isHealing ? 'Healing' : 'Damage';
      const resistance =
        previewResult.resistance?.type !== 'normal'
          ? ` (${previewResult.resistance.type})`
          : '';

      previewContent.innerHTML = `
        <span class="preview-icon">${icon}</span>
        <div class="preview-calculation">
          <div class="damage-breakdown">
            ${previewResult.breakdown || `Base: ${previewResult.baseDamage}`}
          </div>
          <div class="final-result">
            <strong>${type}: ${
        previewResult.finalDamage
      } ${currentData.resourceTarget.toUpperCase()}</strong>
            ${
              resistance
                ? `<span class="preview-resistance">${resistance}</span>`
                : ''
            }
          </div>
        </div>
      `;
    }

    if (previewChange) {
      const difference = previewResult.finalDamage - dialog._originalDamage;
      if (difference !== 0) {
        const sign = difference > 0 ? '+' : '';
        previewChange.textContent = `Change: ${sign}${difference}`;
        previewChange.style.display = 'block';
      } else {
        previewChange.style.display = 'none';
      }
    }
  }

  /**
   * Handle dialog submission from DialogV2 (static method)
   * @param {Object} result - Result from button callback
   * @param {Actor} targetActor - Target actor
   * @param {Actor} sourceActor - Source actor
   * @param {Item} sourceItem - Source item
   * @param {number} originalDamage - Original damage amount
   * @param {string} originalResourceTarget - Original resource target
   * @param {Object} damageData - Current damage configuration
   * @param {string} originalMessageId - ID of original damage message to update
   */
  static async _handleSubmit(
    result,
    targetActor,
    targetTokenId,
    sourceActor,
    sourceItem,
    originalDamage,
    originalResourceTarget,
    damageData,
    originalMessageId
  ) {
    if (result.action === 'apply') {
      // Update damage data with form values
      const updatedDamageData = foundry.utils.mergeObject(
        damageData,
        result.formData
      );

      // Calculate the new damage
      const newDamage = DamageEditDialog._calculatePreviewDamage(
        targetActor,
        sourceActor,
        sourceItem,
        updatedDamageData
      );

      try {
        // Step 1: Revert the original damage completely
        // Step 2: Apply the new damage calculation

        let updates = {};

        if (
          updatedDamageData.resourceTarget === 'hp' ||
          updatedDamageData.resourceTarget === 'both'
        ) {
          const currentHp =
            targetActor.system.stats?.hp?.current ??
            targetActor.system.hp?.current ??
            0;
          const maxHp =
            targetActor.system.stats?.hp?.max ??
            targetActor.system.hp?.max ??
            20;

          // Revert original damage first (only if HP was originally targeted), then apply new damage
          const originallyTargetedHp =
            originalResourceTarget === 'hp' ||
            originalResourceTarget === 'both';
          const revertedHp = originallyTargetedHp
            ? Math.min(currentHp + originalDamage, maxHp)
            : currentHp;
          let finalHp;

          if (newDamage.isHealing) {
            finalHp = Math.min(revertedHp + newDamage.finalDamage, maxHp);
          } else {
            finalHp = Math.max(0, revertedHp - newDamage.finalDamage);
          }

          if (targetActor.system.stats?.hp?.current !== undefined) {
            updates['system.stats.hp.current'] = finalHp;
          } else {
            updates['system.hp.current'] = finalHp;
          }
        }

        if (
          updatedDamageData.resourceTarget === 'wp' ||
          updatedDamageData.resourceTarget === 'both'
        ) {
          const currentWp =
            targetActor.system.stats?.wp?.current ??
            targetActor.system.wp?.current ??
            0;
          const maxWp =
            targetActor.system.stats?.wp?.max ??
            targetActor.system.wp?.max ??
            20;

          // Revert original damage first (only if WP was originally targeted), then apply new damage
          const originallyTargetedWp =
            originalResourceTarget === 'wp' ||
            originalResourceTarget === 'both';
          const revertedWp = originallyTargetedWp
            ? Math.min(currentWp + originalDamage, maxWp)
            : currentWp;
          let finalWp;

          if (newDamage.isHealing) {
            finalWp = Math.min(revertedWp + newDamage.finalDamage, maxWp);
          } else {
            finalWp = Math.max(0, revertedWp - newDamage.finalDamage);
          }

          if (targetActor.system.stats?.wp?.current !== undefined) {
            updates['system.stats.wp.current'] = finalWp;
          } else {
            updates['system.wp.current'] = finalWp;
          }
        }

        if (Object.keys(updates).length > 0) {
          await targetActor.update(updates);
        }

        // Update the original message with strikethrough and disabled buttons
        if (originalMessageId) {
          await DamageEditDialog._updateOriginalMessage(originalMessageId);
        }

        // Create a new chat message for the revised damage
        await DamageEditDialog._createRevisedDamageMessage({
          targetActor,
          targetTokenId,
          sourceActor,
          sourceItem,
          originalDamage,
          newDamage: newDamage.finalDamage,
          damageType: updatedDamageData.damageType,
          resourceTarget: updatedDamageData.resourceTarget,
          isHealing: newDamage.isHealing,
          resistance: newDamage.resistance,
        });

        // Show notification
        const netChange = newDamage.finalDamage - originalDamage;
        const resourceTargetChanged =
          updatedDamageData.resourceTarget !== originalResourceTarget;

        if (netChange !== 0 || resourceTargetChanged) {
          ui.notifications.info(
            game.i18n.format('DASU.Damage.Notifications.DamageRevised', {
              original: originalDamage,
              new: newDamage.finalDamage,
              resource: updatedDamageData.resourceTarget.toUpperCase(),
              name: targetActor.name,
            })
          );
        } else {
          ui.notifications.info(
            game.i18n.localize('DASU.Damage.Notifications.NoNetChange')
          );
        }

        return {
          applied: true,
          originalDamage: originalDamage,
          newDamage: newDamage.finalDamage,
        };
      } catch (error) {
        ui.notifications.error(
          game.i18n.localize('DASU.Damage.Notifications.DamageChangesFailed')
        );
        return { applied: false, error };
      }
    } else {
      return { applied: false };
    }
  }

  /**
   * Create a chat message for revised damage application
   * @param {Object} messageData - Data for the revised damage message
   * @private
   */
  static async _createRevisedDamageMessage(messageData) {
    const {
      targetActor,
      targetTokenId,
      sourceActor,
      sourceItem,
      originalDamage,
      newDamage,
      damageType,
      resourceTarget,
      isHealing,
      resistance,
    } = messageData;

    const damageText = isHealing ? 'healed' : 'damaged';
    const icon = isHealing ? '♥' : '⚔';
    const revisionNote =
      originalDamage !== newDamage ? ` (revised from ${originalDamage})` : '';

    // Build styled content with actions
    let content = `<div class="dasu damage-applied${
      isHealing ? ' healing' : ''
    }">`;
    content += '<div class="damage-applied-content">';

    // Damage text
    content += '<div class="damage-text">';
    content += `<span class="damage-icon">${icon}</span>`;
    // Include token ID for unlinked tokens
    const targetDataAttrs = `data-actor-id="${targetActor.id}"${
      targetTokenId ? ` data-token-id="${targetTokenId}"` : ''
    }`;
    content += `<span class="target-name clickable" ${targetDataAttrs}>${targetActor.name}</span> ${damageText} for `;
    content += `<span class="damage-amount">${newDamage}</span> ${resourceTarget.toUpperCase()}`;

    // Add source item if available
    if (sourceItem) {
      content += ` from <span class="source-item">${sourceItem.name}</span>`;
    }

    // Add modifiers
    const modifiers = [];
    if (resistance && resistance.type !== 'normal') {
      modifiers.push(resistance.type);
    }
    if (revisionNote) {
      modifiers.push('revised');
    }

    if (modifiers.length > 0) {
      content += ` <span class="damage-modifiers">(${modifiers.join(
        ', '
      )})</span>`;
    }

    content += revisionNote;
    content += '</div>';

    // Action buttons
    content += '<div class="damage-actions">';
    content += `<button class="damage-action-btn undo" data-action="undoDamage" data-target-id="${targetActor.id}" data-amount="${newDamage}" data-resource="${resourceTarget}" data-is-healing="${isHealing}">`;
    content += `<i class="fas fa-undo"></i>${game.i18n.localize(
      'DASU.Damage.Actions.Undo'
    )}`;
    content += '</button>';
    content += `<button class="damage-action-btn edit" data-action="editDamage" data-target-id="${targetActor.id}">`;
    content += `<i class="fas fa-edit"></i>${game.i18n.localize(
      'DASU.Damage.Actions.Edit'
    )}`;
    content += '</button>';
    content += '</div>';

    content += '</div></div>';

    await ChatMessage.create({
      content: content,
      speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      flavor: `${damageType} damage applied${revisionNote ? ' (revised)' : ''}`,
      flags: {
        dasu: {
          damageResult: {
            targetId: targetActor.id,
            targetName: targetActor.name,
            targetImg: targetActor.img,
            originalDamage: originalDamage,
            finalDamage: newDamage,
            appliedDamage: newDamage,
            damageType: damageType,
            resourceTarget: resourceTarget,
            isHealing: isHealing,
            resistance: resistance || {
              value: 0,
              type: 'normal',
              multiplier: 1,
            },
            wasRevised: true,
          },
          damageSource: {
            actorId: sourceActor.id,
            itemId: sourceItem?.id,
            damageType: damageType,
            resourceTarget: resourceTarget,
          },
        },
      },
    });
  }

  /**
   * Calculate preview damage based on current settings (static method)
   * @param {Actor} targetActor - Target actor
   * @param {Actor} sourceActor - Source actor
   * @param {Item} sourceItem - Source item
   * @param {Object} damageData - Damage configuration
   * @returns {Object} Preview damage result
   * @private
   */
  static _calculatePreviewDamage(
    targetActor,
    sourceActor,
    sourceItem,
    damageData
  ) {
    try {
      // Create modifiers object
      const modifiers = {
        attributeTick: damageData.govern,
        bonus: damageData.damageMod,
        ignoreResistance:
          damageData.ignoreResist ||
          damageData.ignoreWeak ||
          damageData.ignoreNullify ||
          damageData.ignoreDrain,
      };

      // Calculate base damage
      let baseDamage = DamageCalculator.calculateBaseDamage(
        sourceActor,
        sourceItem,
        modifiers
      );

      // Apply resistance if not ignored
      let finalDamage = baseDamage;
      let resistanceResult = null;

      // Check if any resistance should be applied
      const anyIgnored =
        damageData.ignoreResist ||
        damageData.ignoreWeak ||
        damageData.ignoreNullify ||
        damageData.ignoreDrain;

      if (!anyIgnored) {
        // Apply all resistance normally
        resistanceResult = DamageCalculator.applyResistance(
          baseDamage,
          targetActor,
          damageData.damageType,
          false
        );
        finalDamage = resistanceResult.damage;
      } else {
        // Apply resistance but selectively ignore certain types
        resistanceResult = DamageCalculator.applyResistance(
          baseDamage,
          targetActor,
          damageData.damageType,
          false
        );

        // Override specific resistance types based on ignore flags
        if (
          (resistanceResult.type === 'resist' && damageData.ignoreResist) ||
          (resistanceResult.type === 'weak' && damageData.ignoreWeak) ||
          (resistanceResult.type === 'nullify' && damageData.ignoreNullify) ||
          (resistanceResult.type === 'drain' && damageData.ignoreDrain)
        ) {
          // Override to normal damage
          finalDamage = baseDamage;
          resistanceResult.type = 'normal';
          resistanceResult.multiplier = 1;
        } else {
          finalDamage = resistanceResult.damage;
        }
      }

      // Create damage breakdown string
      let breakdown = '';
      const components = [];

      // Base damage from POW tick + weapon damage
      if (baseDamage > 0) {
        components.push(baseDamage.toString());
      }

      // Damage modifier
      if (damageData.damageMod !== 0) {
        const sign = damageData.damageMod > 0 ? '+' : '';
        components.push(`${sign}${damageData.damageMod}`);
      }

      // Build the equation
      if (components.length > 1) {
        breakdown = `${components.join(' ')} = ${Math.floor(
          baseDamage + damageData.damageMod
        )}`;
      } else {
        breakdown = baseDamage.toString();
      }

      // Add resistance info if applicable
      if (resistanceResult && resistanceResult.type !== 'normal') {
        const resistMultiplier = resistanceResult.multiplier || 1;
        if (resistMultiplier !== 1) {
          breakdown += ` × ${resistMultiplier} = ${Math.floor(finalDamage)}`;
        }
      }

      return {
        baseDamage,
        finalDamage: Math.max(0, Math.floor(finalDamage)),
        resistance: resistanceResult,
        isHealing: resistanceResult?.isHealing || false,
        breakdown: breakdown,
      };
    } catch (error) {
      return {
        baseDamage: 0,
        finalDamage: 0,
        resistance: null,
        isHealing: false,
        breakdown: 'Error',
      };
    }
  }

  /**
   * Update original damage message with strikethrough and disabled buttons
   * @param {string} messageId - ID of the message to update
   * @private
   */
  static async _updateOriginalMessage(messageId) {
    await markMessageAsEdited(
      messageId,
      '.damage-text',
      '.damage-action-btn',
      '.damage-applied-content',
      'damage'
    );
  }
}
