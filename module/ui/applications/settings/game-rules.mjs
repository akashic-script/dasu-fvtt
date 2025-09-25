/**
 * Game Rules Form Application
 * Custom form for editing DASU game rules
 */
export class GameRulesForm extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    id: 'game-rules-settings',
    tag: 'form',
    window: {
      title: 'Game Rules Settings',
      icon: 'fas fa-cogs',
      resizable: true,
    },
    position: {
      width: 500,
      height: 450,
    },
    form: {
      handler: GameRulesForm.#onFormSubmission,
      closeOnSubmit: true,
      scrollable: ['standard-form'],
    },
    actions: {
      resetDefaults: 'onResetDefaults',
      rangeInput: 'onRangeInput',
    },
  };

  static PARTS = {
    form: {
      template: 'systems/dasu/templates/settings/game-rules.hbs',
    },
  };

  /**
   * @override
   */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);

    // Set the localized title when the application is created
    if (this.window) {
      this.window.title = game.i18n.localize('DASU.Settings.gameRules.title');
    }
  }

  /**
   * Prepare the context for template rendering
   * @param {object} options - Render options
   * @returns {object} Template context
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Get all system settings
    context.settings = {
      maxLevel: game.settings.get('dasu', 'maxLevel'),
      startingAP: game.settings.get('dasu', 'startingAP'),
    };

    // Range settings metadata
    context.ranges = {
      maxLevel: { min: 30, max: 60, step: 5 },
    };

    return context;
  }

  /**
   * Handle form submission
   * @param {Event} event - Form submission event
   * @param {HTMLFormElement} form - Form element
   * @param {FormData} formData - Form data
   */
  static async #onFormSubmission(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);

    // Validate maxLevel range
    if (data.maxLevel < 30 || data.maxLevel > 60) {
      ui.notifications.error('Max Level must be between 30 and 60.');
      return;
    }

    // Validate AP values
    if (data.startingAP < 0) {
      ui.notifications.error('Starting AP cannot be negative.');
      return;
    }

    if (data.apPerLevelUp < 0) {
      ui.notifications.error('AP per Level Up cannot be negative.');
      return;
    }

    // Save settings
    await game.settings.set('dasu', 'maxLevel', data.maxLevel);
    await game.settings.set('dasu', 'startingAP', data.startingAP);

    ui.notifications.info('DASU settings saved successfully!');
  }

  /**
   * Handle range input changes (now an instance method)
   * @param {Event} event - Range change event
   * @param {HTMLInputElement} target - Range input element
   */
  onRangeInput(event, target) {
    // For range-picker components, we need to sync the number input
    const rangePicker = target.closest('range-picker');
    if (rangePicker) {
      const numberInput = rangePicker.querySelector('input[type="number"]');
      if (numberInput) {
        numberInput.value = target.value;
      }
    }
  }

  /**
   * Handle reset to defaults action
   * @param {Event} event - Button click event
   * @param {HTMLButtonElement} target - Button element
   */
  async onResetDefaults(event, target) {
    // Create and wait for dialog response
    const result = await foundry.applications.api.DialogV2.confirm({
      title: 'Reset to Defaults',
      content:
        '<p>Are you sure you want to reset all Game Rules settings to their default values?</p>',
      defaultButton: 'no',
    });

    if (result) {
      try {
        // Reset all settings to defaults
        await game.settings.set('dasu', 'maxLevel', 30);
        await game.settings.set('dasu', 'startingAP', 0);

        ui.notifications.info('Game Rules settings reset to defaults!');

        // Re-render this form to show updated values
        this.render();
      } catch (error) {
        console.error('Error resetting Game Rules settings:', error);
        ui.notifications.error(
          'Failed to reset settings. Check console for details.'
        );
      }
    }
  }
}
