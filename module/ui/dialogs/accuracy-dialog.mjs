/**
 * DASU Accuracy Dialog Application
 * Allows users to specify bonuses and modifiers before rolling item accuracy checks
 * Supports weapons (toHit), abilities (toHit), and tactics (toLand)
 */

import Checks from '../../systems/rolling/index.mjs';

export class DASUAccuracyDialog extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  constructor(item, actor = null, initialData = {}, options = {}) {
    super(options);
    this.item = item;
    this.actor = actor || item.actor;
    this.rollData = {
      bonusMod: initialData.bonusMod || 0,
      label: initialData.label || '',
      rollType: initialData.rollType || 'normal',
      ...initialData,
    };
  }

  static DEFAULT_OPTIONS = {
    id: 'dasu-accuracy-dialog',
    tag: 'div',
    window: {
      title: 'DASU Accuracy Roll',
      icon: 'fas fa-crosshairs',
      resizable: false,
    },
    position: {
      width: 400,
      height: 'auto',
    },
    actions: {
      roll: DASUAccuracyDialog._onRoll,
      cancel: DASUAccuracyDialog._onCancel,
    },
  };

  static PARTS = {
    form: {
      template: 'systems/dasu/templates/applications/accuracy-dialog.hbs',
    },
  };

  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);

    // Add change handler for bonus modifier to update display
    const bonusModInput = htmlElement.querySelector('#bonusMod');

    if (bonusModInput) {
      bonusModInput.addEventListener('input', () => {
        this._updateRollDisplay();
      });
    }

    // Add click handlers for roll type toggle buttons
    const toggleBtns = htmlElement.querySelectorAll('.toggle-btn');
    toggleBtns.forEach((btn) => {
      btn.addEventListener('click', (event) => {
        const rollType = event.currentTarget.dataset.rollType;
        this._setRollType(rollType);
        this._updateRollDisplay();
      });
    });
  }

  _setRollType(rollType) {
    this.rollData.rollType = rollType;

    // Update hidden input
    const rollTypeInput = this.element.querySelector('#rollType');
    if (rollTypeInput) {
      rollTypeInput.value = rollType;
    }

    // Update button states
    const toggleBtns = this.element.querySelectorAll('.toggle-btn');
    toggleBtns.forEach((btn) => {
      btn.classList.remove('active');
      if (btn.dataset.rollType === rollType) {
        btn.classList.add('active');
      }
    });
  }

  _updateRollDisplay() {
    // Get current form values
    const form = this.element.querySelector('form');
    if (!form) return;

    const formData = new FormData(form);
    const bonusMod = parseInt(formData.get('bonusMod')) || 0;

    // Get base bonus from item
    let baseBonus = 0;
    switch (this.item.type) {
      case 'weapon':
        baseBonus = this.item.system.toHit || 0;
        break;
      case 'ability':
        baseBonus = this.item.system.toHit || 0;
        break;
      case 'tactic':
        baseBonus = this.item.system.toLand || 0;
        break;
    }

    // Add actor bonuses
    if (this.actor?.system?.stats) {
      if (['weapon', 'ability'].includes(this.item.type)) {
        baseBonus += this.actor.system.stats.toHit?.mod || 0;
      } else if (this.item.type === 'tactic') {
        baseBonus += this.actor.system.stats.toLand?.mod || 0;
      }
    }

    const totalBonus = baseBonus + bonusMod;

    // Determine formula based on roll type
    let formula;
    switch (this.rollData.rollType) {
      case 'advantage':
        formula = `3d6kh2 + ${totalBonus}`;
        break;
      case 'disadvantage':
        formula = `3d6kl2 + ${totalBonus}`;
        break;
      default: // normal
        formula = `2d6 + ${totalBonus}`;
        break;
    }

    // Update the DOM elements
    const formulaElement = this.element.querySelector('.roll-formula');
    const rollButtonFormulaElement = this.element.querySelector(
      '.button-content .dice-display'
    );

    if (formulaElement) {
      formulaElement.textContent = formula;
    }

    if (rollButtonFormulaElement) {
      rollButtonFormulaElement.textContent = formula;
    }
  }

  async _prepareContext() {
    // Get item type and base bonus
    let baseBonus = 0;
    let bonusLabel = '';
    let rollTypeLabel = '';

    switch (this.item.type) {
      case 'weapon':
        baseBonus = this.item.system.toHit || 0;
        bonusLabel = game.i18n.localize('DASU.ToHit');
        rollTypeLabel = game.i18n.localize('DASU.AccuracyCheck');
        break;
      case 'ability':
        baseBonus = this.item.system.toHit || 0;
        bonusLabel = game.i18n.localize('DASU.ToHit');
        rollTypeLabel = game.i18n.localize('DASU.AbilityCheck');
        break;
      case 'tactic':
        baseBonus = this.item.system.toLand || 0;
        bonusLabel = game.i18n.localize('DASU.ToLand');
        rollTypeLabel = game.i18n.localize('DASU.TacticCheck');
        break;
      default:
        baseBonus = 0;
        bonusLabel = game.i18n.localize('DASU.Bonus');
        rollTypeLabel = game.i18n.localize('DASU.RollCheck');
    }

    // Add actor bonuses
    if (this.actor?.system?.stats) {
      if (['weapon', 'ability'].includes(this.item.type)) {
        baseBonus +=
          (this.actor.system.stats.toHit?.mod || 0) +
          (this.actor.system.stats.toHit?.bonus || 0);
      } else if (this.item.type === 'tactic') {
        baseBonus +=
          (this.actor.system.stats.toLand?.mod || 0) +
          (this.actor.system.stats.toLand?.bonus || 0);
      }
    }

    // Calculate total bonus with modifier
    const totalBonus = baseBonus + this.rollData.bonusMod;

    // Determine formula based on roll type
    let formula;
    switch (this.rollData.rollType) {
      case 'advantage':
        formula = `3d6kh2 + ${totalBonus}`;
        break;
      case 'disadvantage':
        formula = `3d6kl2 + ${totalBonus}`;
        break;
      default: // normal
        formula = `2d6 + ${totalBonus}`;
        break;
    }

    return {
      item: {
        name: this.item.name,
        img: this.item.img,
        type: this.item.type,
      },
      actor: {
        name: this.actor.name,
        img: this.actor.img,
      },
      rollData: this.rollData,
      baseBonus,
      bonusLabel,
      rollTypeLabel,
      totalBonus,
      formula,
      canRoll: true,
    };
  }

  static async _onRoll(event, target) {
    // Find the form element
    const form = target.closest('form') || this.element.querySelector('form');
    const formData = new FormData(form);

    // Update roll data from form
    this.rollData.bonusMod = parseInt(formData.get('bonusMod')) || 0;
    this.rollData.label = formData.get('label') || '';
    this.rollData.rollType = formData.get('rollType') || 'normal';

    try {
      // Calculate total modifier to apply
      let baseBonus = 0;
      switch (this.item.type) {
        case 'weapon':
          baseBonus = this.item.system.toHit || 0;
          break;
        case 'ability':
          baseBonus = this.item.system.toHit || 0;
          break;
        case 'tactic':
          baseBonus = this.item.system.toLand || 0;
          break;
      }

      // Create roll options with custom modifier
      const rollOptions = {
        rollMode: game.settings.get('core', 'rollMode'),
        bonusModifier: this.rollData.bonusMod,
        customLabel: this.rollData.label,
        rollType: this.rollData.rollType,
      };

      // Create and execute the roll using new Checks API
      const config = (check) => {
        if (rollOptions.bonusModifier) {
          check.modifiers.push({
            label: 'Bonus Modifier',
            value: rollOptions.bonusModifier,
            source: 'dialog',
          });
        }

        // Handle advantage/disadvantage
        if (rollOptions.rollType === 'advantage') {
          check.advantageState = 'advantage';
          check.baseRoll = '3d6kh2';
        } else if (rollOptions.rollType === 'disadvantage') {
          check.advantageState = 'disadvantage';
          check.baseRoll = '3d6kl2';
        }
      };

      await Checks.accuracyCheck(this.actor, this.item, config);

      // Close the dialog
      this.close();
    } catch (error) {
      console.error('DASU Accuracy Dialog | Error executing roll:', error);
      ui.notifications.error(`Roll failed: ${error.message}`);
    }
  }

  static async _onCancel(event, target) {
    this.close();
  }

  /**
   * Static method to open accuracy dialog for an item
   */
  static async openForItem(item, actor = null) {
    const dialog = new DASUAccuracyDialog(item, actor);
    return dialog.render(true);
  }
}
