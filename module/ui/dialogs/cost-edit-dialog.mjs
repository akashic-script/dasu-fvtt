/**
 * @fileoverview Cost Edit Dialog
 * Dialog for customizing resource costs before applying them.
 * Similar to healing dialog but for costs (resource reduction).
 */

import { markMessageAsEdited } from '../../utils/chat-helpers.mjs';

/**
 * Cost edit dialog for customizing resource costs
 */
export class CostEditDialog {
  /**
   * Create and display a cost edit dialog
   * @param {Object} options - Dialog options
   * @param {Actor} options.targetActor - The actor that will pay the cost
   * @param {Actor} options.sourceActor - The actor initiating the cost
   * @param {Item} options.sourceItem - The source item (if any)
   * @param {number} options.originalCost - Original cost amount
   * @param {string} options.originalResourceTarget - Original resource target (hp, wp, both)
   * @param {number} [options.costMod=0] - Cost modifier
   * @param {string} [options.costType='wp'] - Type of cost
   * @returns {Promise<Object>} Dialog result
   */
  static async create(options = {}) {
    // Store data
    const targetActor = options.targetActor;
    const sourceActor = options.sourceActor;
    const sourceItem = options.sourceItem;
    const originalCost = options.originalCost;
    const originalResourceTarget = options.originalResourceTarget;
    const originalMessageId = options.originalMessageId || null;

    // Default cost data
    const costData = {
      costMod: options.costMod || 0,
      costType: options.costType || originalResourceTarget || 'wp',
    };

    // Prepare context for template
    const context = {
      targetActor,
      sourceActor,
      sourceItem,
      originalCost,
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
      costData,
      previewCost: this._calculatePreviewCost(
        targetActor,
        originalCost,
        costData
      ),
      costTypeOptions: [
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
      'systems/dasu/templates/dialogs/cost-edit.hbs',
      context
    );

    // Configure DialogV2 options
    const dialogOptions = {
      window: {
        title: game.i18n.format('Cost Payment: {name}', {
          name: targetActor.name,
        }),
        classes: ['dasu', 'cost-edit-dialog'],
      },
      position: { width: 400 },
      content: content,
      buttons: [
        {
          action: 'cancel',
          icon: 'fas fa-times',
          label: 'Cancel',
          callback: () => ({ action: 'cancel' }),
        },
        {
          action: 'apply',
          icon: 'fas fa-check',
          label: 'Pay Cost',
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
          _costData: costData,
          _originalCost: originalCost,
          _targetActor: targetActor,
          _sourceActor: sourceActor,
          _sourceItem: sourceItem,
        });

        // Setup form change handlers for live preview
        const form = dialog.element.querySelector('form');
        if (form) {
          form.addEventListener('change', () =>
            CostEditDialog._updatePreview(dialog)
          );
          form.addEventListener('input', (e) => {
            if (e.target.type === 'number')
              CostEditDialog._updatePreview(dialog);
          });
        }

        // Calculate initial preview
        setTimeout(() => CostEditDialog._updatePreview(dialog), 50);
      },
      submit: (result) => {
        // Handle submit in a static context
        if (result.action === 'apply') {
          return CostEditDialog._handleSubmit(
            result,
            targetActor,
            sourceActor,
            sourceItem,
            originalCost,
            costData,
            originalMessageId
          );
        }
        return { applied: false };
      },
    };

    return foundry.applications.api.DialogV2.wait(dialogOptions);
  }

  /**
   * Update the cost preview in the dialog
   * @param {DialogV2} dialog - The dialog instance
   * @private
   */
  static _updatePreview(dialog) {
    const form = dialog.element.querySelector('form');
    if (!form) return;

    // Get current form data
    const formData = new foundry.applications.ux.FormDataExtended(form);
    const currentData = foundry.utils.mergeObject(
      dialog._costData,
      formData.object
    );

    // Calculate preview
    const preview = this._calculatePreviewCost(
      dialog._targetActor,
      dialog._originalCost,
      currentData
    );

    // Update preview display
    const previewEl = dialog.element.querySelector('.cost-preview');
    if (previewEl) {
      previewEl.innerHTML = this._generatePreviewHTML(preview);
    }
  }

  /**
   * Calculate preview cost
   * @param {Actor} targetActor - Target actor
   * @param {number} baseCost - Base cost amount
   * @param {Object} costData - Cost data
   * @returns {Object} Preview data
   * @private
   */
  static _calculatePreviewCost(targetActor, baseCost, costData) {
    const costMod = parseInt(costData.costMod) || 0;
    const finalCost = Math.max(0, baseCost + costMod);

    const currentHp =
      targetActor.system.stats?.hp?.current ??
      targetActor.system.hp?.current ??
      0;
    const currentWp =
      targetActor.system.stats?.wp?.current ??
      targetActor.system.wp?.current ??
      0;

    let newHp = currentHp;
    let newWp = currentWp;
    let hpPaid = 0;
    let wpPaid = 0;

    if (costData.costType === 'hp' || costData.costType === 'both') {
      newHp = Math.max(0, currentHp - finalCost);
      hpPaid = currentHp - newHp;
    }

    if (costData.costType === 'wp' || costData.costType === 'both') {
      newWp = Math.max(0, currentWp - finalCost);
      wpPaid = currentWp - newWp;
    }

    return {
      baseCost,
      costMod,
      finalCost,
      currentHp,
      currentWp,
      newHp,
      newWp,
      hpPaid,
      wpPaid,
      costType: costData.costType,
    };
  }

  /**
   * Generate preview HTML
   * @param {Object} preview - Preview data
   * @returns {string} HTML string
   * @private
   */
  static _generatePreviewHTML(preview) {
    let html = '<div class="preview-breakdown">';

    // Base cost
    html += `<div class="preview-line">
      <span class="preview-label">Base Cost:</span>
      <span class="preview-value">${preview.baseCost}</span>
    </div>`;

    // Modifier
    if (preview.costMod !== 0) {
      const sign = preview.costMod > 0 ? '+' : '';
      html += `<div class="preview-line">
        <span class="preview-label">Modifier:</span>
        <span class="preview-value">${sign}${preview.costMod}</span>
      </div>`;
    }

    // Final cost
    html += `<div class="preview-line preview-total">
      <span class="preview-label">Final Cost:</span>
      <span class="preview-value cost-amount">${preview.finalCost}</span>
    </div>`;

    html += '<hr class="preview-divider">';

    // Resource changes
    if (preview.costType === 'hp' || preview.costType === 'both') {
      html += `<div class="preview-line">
        <span class="preview-label">HP:</span>
        <span class="preview-value">${preview.currentHp} → ${preview.newHp} <span class="cost-change">(-${preview.hpPaid})</span></span>
      </div>`;
    }

    if (preview.costType === 'wp' || preview.costType === 'both') {
      html += `<div class="preview-line">
        <span class="preview-label">WP:</span>
        <span class="preview-value">${preview.currentWp} → ${preview.newWp} <span class="cost-change">(-${preview.wpPaid})</span></span>
      </div>`;
    }

    html += '</div>';
    return html;
  }

  /**
   * Handle dialog submission
   * @private
   */
  static async _handleSubmit(
    result,
    targetActor,
    sourceActor,
    sourceItem,
    originalCost,
    costData,
    originalMessageId
  ) {
    const formData = result.formData;

    // Calculate final cost
    const costMod = parseInt(formData.costMod) || 0;
    const finalCost = Math.max(0, originalCost + costMod);
    const costType = formData.costType || costData.costType;

    // Apply cost by directly reducing resources
    const currentHp =
      targetActor.system.stats?.hp?.current ??
      targetActor.system.hp?.current ??
      0;
    const currentWp =
      targetActor.system.stats?.wp?.current ??
      targetActor.system.wp?.current ??
      0;

    const updates = {};
    let appliedCost = 0;

    if (costType === 'hp' || costType === 'both') {
      const newHp = Math.max(0, currentHp - finalCost);
      appliedCost += currentHp - newHp;
      if (targetActor.system.stats?.hp?.current !== undefined) {
        updates['system.stats.hp.current'] = newHp;
      } else {
        updates['system.hp.current'] = newHp;
      }
    }

    if (costType === 'wp' || costType === 'both') {
      const newWp = Math.max(0, currentWp - finalCost);
      appliedCost += currentWp - newWp;
      if (targetActor.system.stats?.wp?.current !== undefined) {
        updates['system.stats.wp.current'] = newWp;
      } else {
        updates['system.wp.current'] = newWp;
      }
    }

    if (Object.keys(updates).length > 0) {
      await targetActor.update(updates);
    }

    // Create chat message
    const content = `
      <div class='dasu cost-applied'>
        <div class='cost-applied-content'>
          <div class='cost-text'>
            <span class='cost-icon'><i class="fas fa-coins"></i></span>
            <strong class="target-name clickable" data-actor-id="${
              targetActor.id
            }">${targetActor.name}</strong> paid
            <strong class='cost-amount'>${appliedCost}</strong> ${costType.toUpperCase()}
          </div>
          <div class='cost-actions-small'>
            <button class='cost-action-btn undo' data-action='undoCost' data-target-id='${
              targetActor.id
            }' data-amount='${appliedCost}' data-resource='${costType}'>
              <i class='fas fa-undo'></i>Undo
            </button>
          </div>
        </div>
      </div>
    `;

    await ChatMessage.create({
      content,
      speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
      flags: {
        dasu: {
          costApplication: {
            targetId: targetActor.id,
            targetName: targetActor.name,
            appliedCost,
            costType,
            baseCost: originalCost,
          },
          enricherCost: true,
        },
      },
    });

    // Mark original message as edited if provided
    if (originalMessageId) {
      const originalMessage = game.messages.get(originalMessageId);
      if (originalMessage) {
        await markMessageAsEdited(originalMessage);
      }
    }

    return { applied: true, amount: appliedCost };
  }
}
