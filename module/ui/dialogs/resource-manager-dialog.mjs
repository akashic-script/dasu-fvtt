/**
 * @fileoverview Resource Manager Dialog
 * DialogV2 for managing HP/WP values including current, temp, and mod.
 * Provides an interface for editing resource settings and adjusting current/temp values.
 */

/* global */

/**
 * Resource Manager Dialog class
 * Manages HP and WP resources for actors through an interactive DialogV2 interface.
 *
 * Features:
 * - Edit HP/WP modifiers
 * - Set temporary HP/WP values
 * - Adjust current HP/WP (add or subtract)
 * - Adjust temporary HP/WP (add or subtract)
 * - Apply button keeps dialog open for multiple adjustments
 * - Close button closes the dialog
 *
 * @example
 * // Open the HP manager for an actor
 * await ResourceManagerDialog.open(actor, 'hp');
 *
 * @example
 * // Open the WP manager for an actor
 * await ResourceManagerDialog.open(actor, 'wp');
 */
export class ResourceManagerDialog {
  /**
   * Processes form data and applies updates to the actor
   * @private
   * @param {Actor} actor - The actor to update
   * @param {string} resourceType - Resource type ('hp' or 'wp')
   * @param {Object} formData - Form data object
   * @param {string} label - Display label (HP or WP)
   * @returns {Promise<void>}
   */
  static async _applyFormData(actor, resourceType, formData, label) {
    const currentResource = actor.system.stats[resourceType];
    const updates = {};

    // Update mod if changed
    if (formData.mod !== currentResource.mod) {
      updates[`system.stats.${resourceType}.mod`] = formData.mod;
    }

    // Update temp if changed
    if (formData.temp !== currentResource.temp) {
      updates[`system.stats.${resourceType}.temp`] = Math.max(0, formData.temp);
    }

    // Apply current adjustment
    if (formData.adjustCurrent && formData.adjustCurrent !== 0) {
      const newCurrent = Math.max(
        0,
        Math.min(
          currentResource.max,
          currentResource.current + formData.adjustCurrent
        )
      );
      updates[`system.stats.${resourceType}.current`] = newCurrent;

      // Notify about the change
      const verb = formData.adjustCurrent > 0 ? 'gained' : 'lost';
      const amount = Math.abs(formData.adjustCurrent);
      ui.notifications.info(`${actor.name} ${verb} ${amount} ${label}`);
    }

    // Apply temp adjustment
    if (formData.adjustTemp && formData.adjustTemp !== 0) {
      const newTemp = Math.max(0, currentResource.temp + formData.adjustTemp);
      updates[`system.stats.${resourceType}.temp`] = newTemp;

      // Notify about the change
      const verb = formData.adjustTemp > 0 ? 'gained' : 'lost';
      const amount = Math.abs(formData.adjustTemp);
      ui.notifications.info(
        `${actor.name} ${verb} ${amount} temporary ${label}`
      );
    }

    // Apply all updates
    if (Object.keys(updates).length > 0) {
      await actor.update(updates);
    }
  }

  /**
   * Opens the resource manager dialog for the specified actor and resource type
   *
   * @param {Actor} actor - The actor to manage resources for
   * @param {string} resourceType - Resource type to manage ('hp' or 'wp')
   * @returns {Promise<void>}
   * @throws {Error} If actor is invalid or resource type is not 'hp' or 'wp'
   */
  static async open(actor, resourceType) {
    const resource = actor.system.stats[resourceType];
    const label = resourceType.toUpperCase();

    const content = `
      <form class="resource-manager-form">
        <div class="form-section">
          <div class="section-header">
            <h3>Edit ${label} Settings</h3>
          </div>

          <div class="form-group">
            <label for="hp-mod">${label} Modifier</label>
            <input type="number" id="hp-mod" name="mod" value="${resource.mod}" data-dtype="Number" />
            <p class="hint">Permanent ${label} modifier</p>
          </div>

          <div class="form-group">
            <label for="temp-hp">Temporary ${label}</label>
            <input type="number" id="temp-hp" name="temp" value="${resource.temp}" min="0" data-dtype="Number" />
            <p class="hint">Current temporary ${label}</p>
          </div>
        </div>

        <div class="form-section">
          <div class="section-header">
            <h3>Adjust ${label}</h3>
          </div>

          <div class="form-group">
            <label for="adjust-current">Current ${label} Adjustment</label>
            <input type="number" id="adjust-current" name="adjustCurrent" value="0" placeholder="e.g., 36 or -36" data-dtype="Number" />
            <p class="hint">Add/subtract from current ${label} (${resource.current}/${resource.max})</p>
          </div>

          <div class="form-group quick-set-buttons">
            <button type="button" class="quick-set-btn" data-action="setFull">Full ${label}</button>
            <button type="button" class="quick-set-btn" data-action="setHalf">Half ${label}</button>
          </div>

          <div class="form-group">
            <label for="adjust-temp">Temp ${label} Adjustment</label>
            <input type="number" id="adjust-temp" name="adjustTemp" value="0" placeholder="e.g., 10 or -5" data-dtype="Number" />
            <p class="hint">Add/subtract from temp ${label} (current: ${resource.temp})</p>
          </div>
        </div>
      </form>
    `;

    const dialog = await foundry.applications.api.DialogV2.prompt({
      window: {
        title: `Manage ${label}`,
        icon: 'fa-heart-pulse',
      },
      content,
      classes: ['dasu', 'resource-manager-dialog'],
      render: (_event, dialog) => {
        // Add event handlers for quick-set buttons
        const fullBtn = dialog.element.querySelector('[data-action="setFull"]');
        const halfBtn = dialog.element.querySelector('[data-action="setHalf"]');

        if (fullBtn) {
          fullBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const maxValue = actor.system.stats[resourceType].max;

            // Apply the adjustment directly
            await actor.update({
              [`system.stats.${resourceType}.current`]: maxValue,
            });

            ui.notifications.info(
              `${actor.name} restored to full ${label} (${maxValue})`
            );

            // Re-open the dialog
            dialog.close();
            ResourceManagerDialog.open(actor, resourceType);
          });
        }

        if (halfBtn) {
          halfBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const maxValue = actor.system.stats[resourceType].max;
            const halfValue = Math.floor(maxValue / 2);

            // Apply the adjustment directly
            await actor.update({
              [`system.stats.${resourceType}.current`]: halfValue,
            });

            ui.notifications.info(
              `${actor.name} set to half ${label} (${halfValue})`
            );

            // Re-open the dialog
            dialog.close();
            ResourceManagerDialog.open(actor, resourceType);
          });
        }
      },
      buttons: [
        {
          action: 'apply',
          label: 'Apply',
          callback: async (_event, _button, dialog) => {
            // Get form element from dialog
            const form = dialog.element.querySelector('form');
            if (!form) {
              console.warn('Form not found in dialog');
              return { reopen: false };
            }

            const formData = new foundry.applications.ux.FormDataExtended(form)
              .object;

            // Apply form data using helper function
            await ResourceManagerDialog._applyFormData(
              actor,
              resourceType,
              formData,
              label
            );

            // Close and re-open dialog with updated values
            return { reopen: true };
          },
        },
        {
          action: 'ok',
          label: 'Confirm',
          icon: 'fa-solid fa-check',
          default: true,
          callback: async (_event, _button, dialog) => {
            // Get form element from dialog
            const form = dialog.element.querySelector('form');
            if (!form) {
              console.warn('Form not found in dialog');
              return { reopen: false };
            }

            const formData = new foundry.applications.ux.FormDataExtended(form)
              .object;

            // Apply form data using helper function
            await ResourceManagerDialog._applyFormData(
              actor,
              resourceType,
              formData,
              label
            );

            // Return without reopen flag to close the dialog
            return { reopen: false };
          },
        },
      ],
      rejectClose: false,
    });

    // If Apply was clicked, re-open the dialog
    if (dialog?.reopen) {
      this.open(actor, resourceType);
    }
  }
}
