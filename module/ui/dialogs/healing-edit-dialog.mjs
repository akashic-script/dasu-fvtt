/**
 * @fileoverview Healing Edit Dialog
 * Retroactive healing editing dialog using DialogV2.
 * Allows modification of healing modifiers, attribute ticks, and healing types.
 */

import { markMessageAsEdited } from '../../utils/chat-helpers.mjs';

/**
 * Healing edit dialog for retroactive modification of healing effects
 */
export class HealingEditDialog {
  /**
   * Create and display a healing edit dialog
   * @param {Object} options - Dialog options
   * @param {Actor} options.targetActor - The actor that received healing
   * @param {Actor} options.sourceActor - The actor that provided healing
   * @param {Item} options.sourceItem - The healing item used
   * @param {number} options.originalHealing - Original healing amount applied
   * @param {string} options.originalResourceTarget - Original resource target (hp, wp, both)
   * @param {string} [options.attributeTick='pow'] - Attribute to tick
   * @param {number} [options.healMod=0] - Healing modifier
   * @param {string} [options.healType='hp'] - Type of healing
   * @returns {Promise<Object>} Dialog result
   */
  static async create(options = {}) {
    // Store data
    const targetActor = options.targetActor;
    const sourceActor = options.sourceActor;
    const sourceItem = options.sourceItem;
    const originalHealing = options.originalHealing;
    const originalResourceTarget = options.originalResourceTarget;
    const originalMessageId = options.originalMessageId || null;

    // Default healing data - use sourceItem's governing attribute if available
    const healingData = {
      govern:
        options.govern ||
        options.attributeTick ||
        sourceItem?.system?.govern ||
        'pow',
      healMod: options.healMod || 0,
      healType: options.healType || originalResourceTarget || 'hp',
    };

    // Prepare context for template
    const context = {
      targetActor,
      sourceActor,
      sourceItem,
      originalHealing,
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
      healingData,
      previewHealing: this._calculatePreviewHealing(
        targetActor,
        sourceActor,
        sourceItem,
        healingData,
        originalHealing
      ),
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
      healTypeOptions: [
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
      'systems/dasu/templates/dialogs/healing-edit.hbs',
      context
    );

    // Configure DialogV2 options
    const dialogOptions = {
      window: {
        title: game.i18n.format('DASU.Healing.EditDialog.Title', {
          name: targetActor.name,
        }),
        classes: ['dasu', 'healing-edit-dialog'],
      },
      position: { width: 400 },
      content: content,
      buttons: [
        {
          action: 'cancel',
          icon: 'fas fa-times',
          label: game.i18n.localize('DASU.Healing.EditDialog.Cancel'),
          callback: () => ({ action: 'cancel' }),
        },
        {
          action: 'apply',
          icon: 'fas fa-check',
          label: game.i18n.localize('DASU.Healing.EditDialog.ApplyChanges'),
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
          _healingData: healingData,
          _originalHealing: originalHealing,
          _targetActor: targetActor,
          _sourceActor: sourceActor,
          _sourceItem: sourceItem,
        });

        // Setup form change handlers for live preview
        const form = dialog.element.querySelector('form');
        if (form) {
          form.addEventListener('change', () =>
            HealingEditDialog._updatePreview(dialog)
          );
          form.addEventListener('input', (e) => {
            if (e.target.type === 'number')
              HealingEditDialog._updatePreview(dialog);
          });
        }

        // Calculate initial preview
        setTimeout(() => HealingEditDialog._updatePreview(dialog), 50);
      },
      submit: (result) => {
        // Handle submit in a static context
        if (result.action === 'apply') {
          return HealingEditDialog._handleSubmit(
            result,
            targetActor,
            sourceActor,
            sourceItem,
            originalHealing,
            healingData,
            originalMessageId
          );
        }
        return { applied: false };
      },
    };

    return foundry.applications.api.DialogV2.wait(dialogOptions);
  }

  /**
   * Update the healing preview in the dialog
   * @param {DialogV2} dialog - The dialog instance
   * @private
   */
  static _updatePreview(dialog) {
    const form = dialog.element.querySelector('form');
    if (!form) return;

    // Get current form data
    const formData = new foundry.applications.ux.FormDataExtended(form);
    const currentData = foundry.utils.mergeObject(
      dialog._healingData,
      formData.object
    );

    // Calculate new preview
    const previewResult = this._calculatePreviewHealing(
      dialog._targetActor,
      dialog._sourceActor,
      dialog._sourceItem,
      currentData,
      dialog._originalHealing
    );

    // Update preview content
    const previewContent = dialog.element.querySelector('.preview-content');
    const previewChange = dialog.element.querySelector('.preview-change');

    if (previewContent) {
      const icon = '♥';
      const type = 'Healing';

      previewContent.innerHTML = `
        <span class="preview-icon">${icon}</span>
        <div class="preview-calculation">
          <div class="healing-breakdown">
            ${previewResult.breakdown}
          </div>
          <div class="final-result">
            <strong>${type}: ${
        previewResult.finalHealing
      } ${currentData.healType.toUpperCase()}</strong>
          </div>
        </div>
      `;
    }

    if (previewChange) {
      const change = previewResult.finalHealing - dialog._originalHealing;
      if (change !== 0) {
        previewChange.innerHTML = `Change: ${change > 0 ? '+' : ''}${change}`;
        previewChange.style.display = 'block';
      } else {
        previewChange.style.display = 'none';
      }
    }
  }

  /**
   * Calculate preview healing based on current settings
   * @param {Actor} targetActor - Target actor
   * @param {Actor} sourceActor - Source actor
   * @param {Item} sourceItem - Source item
   * @param {Object} healingData - Current healing configuration
   * @param {number} originalHealing - The original healing amount that was applied
   * @returns {Object} Preview healing result
   * @private
   */
  static _calculatePreviewHealing(
    targetActor,
    sourceActor,
    sourceItem,
    healingData,
    originalHealing
  ) {
    // Base healing from source item
    const baseHealing = sourceItem?.system?.healed?.value || 0;

    // Get attribute tick value (this was already applied in original, but show for reference)
    let tickValue = 0;
    if (sourceActor && sourceItem?.system?.govern) {
      // Get attribute tick - use item's governing attribute
      const attributeTick = sourceItem.system.govern;
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

    // The new healing amount is the original healing + modifier
    // (attribute tick was already included in originalHealing)
    const finalHealing = Math.max(
      0,
      originalHealing + (healingData.healMod || 0)
    );

    // Build breakdown text - show original healing and any modifications
    let breakdown = `Original healing: ${originalHealing}`;
    if (healingData.healMod) {
      breakdown += ` + ${healingData.healMod} (mod)`;
    }

    return {
      baseHealing,
      finalHealing,
      healType: healingData.healType,
      breakdown,
    };
  }

  /**
   * Handle dialog submission
   * @param {Object} result - Form submission result
   * @param {Actor} targetActor - Target actor
   * @param {Actor} sourceActor - Source actor
   * @param {Item} sourceItem - Source item
   * @param {number} originalHealing - Original healing amount
   * @param {Object} healingData - Original healing data
   * @param {string} originalMessageId - ID of original healing message to update
   * @returns {Promise<Object>} Submit result
   * @private
   */
  static async _handleSubmit(
    result,
    targetActor,
    sourceActor,
    sourceItem,
    originalHealing,
    healingData,
    originalMessageId
  ) {
    try {
      const formData = result.formData;
      const newHealingData = foundry.utils.mergeObject(healingData, formData);

      // Calculate new healing amount
      const previewResult = this._calculatePreviewHealing(
        targetActor,
        sourceActor,
        sourceItem,
        newHealingData,
        originalHealing
      );
      const newHealingAmount = previewResult.finalHealing;

      // Calculate the difference to apply
      const healingDifference = newHealingAmount - originalHealing;

      if (healingDifference !== 0) {
        // Apply the healing difference
        if (healingDifference > 0) {
          // Apply additional healing
          await targetActor.applyHealing(
            healingDifference,
            newHealingData.healType,
            { suppressChat: true }
          );
        } else {
          // Remove excess healing by applying damage
          await targetActor.applyDamage(
            Math.abs(healingDifference),
            'none',
            newHealingData.healType,
            { suppressChat: true }
          );
        }

        // Note: Attribute tick is already factored into the healing calculation
        // No need to advance the attribute separately

        // Update the original message with strikethrough and disabled buttons
        if (originalMessageId) {
          await HealingEditDialog._updateOriginalMessage(originalMessageId);
        }

        ui.notifications.info(
          `Updated healing for ${
            targetActor.name
          }: ${newHealingAmount} ${newHealingData.healType.toUpperCase()}`
        );

        return {
          applied: true,
          newHealing: newHealingAmount,
          oldHealing: originalHealing,
          healType: newHealingData.healType,
          attributeTick: newHealingData.govern,
        };
      } else {
        ui.notifications.info('No changes to apply');
        return { applied: false };
      }
    } catch (error) {
      ui.notifications.error(
        `Failed to apply healing changes: ${error.message}`
      );
      return { applied: false, error: error.message };
    }
  }

  /**
   * Update original healing message with strikethrough and disabled buttons
   * @param {string} messageId - ID of the message to update
   * @private
   */
  static async _updateOriginalMessage(messageId) {
    await markMessageAsEdited(
      messageId,
      '.healing-text',
      '.healing-action-btn',
      '.healing-applied-content',
      'healing'
    );
  }
}
