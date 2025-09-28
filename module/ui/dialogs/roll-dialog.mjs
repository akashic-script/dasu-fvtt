/**
 * DASU Roll Dialog Application
 * Allows users to specify attributes, skills, and dice modifiers before rolling
 * Supports both attribute checks and skill checks with success-based rolling
 */

import Checks from '../../systems/rolling/index.mjs';

export class DASURollDialog extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  constructor(actor, initialData = {}, options = {}) {
    super(options);
    this.actor = actor;

    // Handle selectedAttribute for single attribute checks
    let primaryAttribute = initialData.primaryAttribute || 'pow';
    let secondaryAttribute = initialData.secondaryAttribute || 'dex';

    if (initialData.selectedAttribute) {
      primaryAttribute = initialData.selectedAttribute;
      // For single attribute checks, set secondary to same as primary initially
      secondaryAttribute = initialData.selectedAttribute;
    }

    this.rollData = {
      rollType: initialData.rollType || 'attribute', // 'attribute', 'skill', or 'initiative'
      primaryAttribute,
      secondaryAttribute,
      selectedSkill: initialData.selectedSkill || null,
      governingAttribute: initialData.governingAttribute || null,
      diceMod: initialData.diceMod || 0,
      label: initialData.label || '',
      ...initialData,
    };
  }

  static DEFAULT_OPTIONS = {
    id: 'dasu-roll-dialog',
    tag: 'div',
    window: {
      title: 'DASU Roll',
      icon: 'fas fa-dice-d6',
      resizable: false,
    },
    position: {
      width: 400,
      height: 'auto',
    },
    actions: {
      roll: DASURollDialog._onRoll,
      cancel: DASURollDialog._onCancel,
      switchType: DASURollDialog._onSwitchType,
    },
  };

  static PARTS = {
    form: {
      template: 'systems/dasu/templates/applications/roll-dialog.hbs',
    },
  };

  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);

    // Add change handlers for all dropdowns and inputs that affect dice pool
    const skillSelect = htmlElement.querySelector('#selectedSkill');
    const governingSelect = htmlElement.querySelector('#governingAttribute');
    const primarySelect = htmlElement.querySelector('#primaryAttribute');
    const secondarySelect = htmlElement.querySelector('#secondaryAttribute');
    const initiativeSelect = htmlElement.querySelector('#initiativeType');
    const diceModInput = htmlElement.querySelector('#diceMod');

    if (skillSelect) {
      skillSelect.addEventListener('change', (event) => {
        this._onSkillChange(event);
        this._updateDiceDisplay();
      });
    }

    if (governingSelect) {
      governingSelect.addEventListener('change', () => {
        this._updateDiceDisplay();
      });
    }

    if (primarySelect) {
      primarySelect.addEventListener('change', () => {
        this._updateDiceDisplay();
      });
    }

    if (secondarySelect) {
      secondarySelect.addEventListener('change', () => {
        this._updateDiceDisplay();
      });
    }

    if (initiativeSelect) {
      initiativeSelect.addEventListener('change', () => {
        this._updateDiceDisplay();
      });
    }

    if (diceModInput) {
      diceModInput.addEventListener('input', () => {
        this._updateDiceDisplay();
      });
    }
  }

  async _onSkillChange(event) {
    const skillName = event.target.value;
    if (!skillName) return;

    // Find the selected skill and its governing attribute
    const skills = this.actor.system.skills || [];
    const selectedSkill = skills.find((s) => s.name === skillName);

    if (selectedSkill && selectedSkill.govern) {
      // Update the governing attribute dropdown
      this.rollData.governingAttribute = selectedSkill.govern;

      // Update the dropdown selection without full re-render
      const governingSelect = this.element.querySelector('#governingAttribute');
      if (governingSelect) {
        governingSelect.value = selectedSkill.govern;
      }
    }
  }

  _updateDiceDisplay() {
    // Get current form values
    const form = this.element.querySelector('form');
    if (!form) return;

    const formData = new FormData(form);
    const rollType = formData.get('rollType');
    const diceMod = parseInt(formData.get('diceMod')) || 0;

    // Prepare attributes data
    const attributes = {
      pow: {
        label: 'Power',
        tick: this.actor.system.attributes.pow?.tick || 1,
      },
      dex: {
        label: 'Dexterity',
        tick: this.actor.system.attributes.dex?.tick || 1,
      },
      will: {
        label: 'Willpower',
        tick: this.actor.system.attributes.will?.tick || 1,
      },
      sta: {
        label: 'Stamina',
        tick: this.actor.system.attributes.sta?.tick || 1,
      },
    };

    let totalDice = 0;
    let breakdown = '';

    if (rollType === 'skill') {
      const selectedSkill = formData.get('selectedSkill');
      const governingAttribute = formData.get('governingAttribute');

      if (selectedSkill && governingAttribute) {
        const skills = this.actor.system.skills || [];
        const skill = skills.find((s) => s.name === selectedSkill);

        if (skill) {
          const skillDice = skill.ticks || 0;
          const attributeDice = attributes[governingAttribute]?.tick || 0;
          totalDice = skillDice + attributeDice + diceMod;
          breakdown = `${skill.name}: ${skillDice}d6 + ${attributes[governingAttribute]?.label}: ${attributeDice}d6`;
        }
      }
    } else if (rollType === 'initiative') {
      const initiativeType = formData.get('initiativeType');

      if (initiativeType) {
        if (initiativeType === 'dex') {
          const dexTicks = attributes.dex?.tick || 1;
          totalDice = 2; // Only 2d6 are rolled
          const flatMod = dexTicks + diceMod;
          breakdown = `2d6 + ${dexTicks}${
            diceMod !== 0 ? ` ${diceMod >= 0 ? '+' : ''}${diceMod}` : ''
          } (DEX ticks)`;
        } else if (initiativeType.startsWith('skill:')) {
          const skillName = initiativeType.substring(6); // Remove 'skill:' prefix
          const skills = this.actor.system.skills || [];
          const skill = skills.find((s) => s.name === skillName);

          if (skill) {
            const skillTicks = skill.ticks || 0;
            totalDice = 2; // Only 2d6 are rolled
            const flatMod = skillTicks + diceMod;
            breakdown = `2d6 + ${skillTicks}${
              diceMod !== 0 ? ` ${diceMod >= 0 ? '+' : ''}${diceMod}` : ''
            } (${skill.name} ticks)`;
          }
        }
      }
    } else {
      // Dual attribute check
      const primaryAttribute = formData.get('primaryAttribute');
      const secondaryAttribute = formData.get('secondaryAttribute');

      if (primaryAttribute && secondaryAttribute) {
        const primaryDice = attributes[primaryAttribute]?.tick || 0;
        const secondaryDice = attributes[secondaryAttribute]?.tick || 0;
        totalDice = primaryDice + secondaryDice + diceMod;
        breakdown = `${attributes[primaryAttribute]?.label}: ${primaryDice}d6 + ${attributes[secondaryAttribute]?.label}: ${secondaryDice}d6`;
      } else if (primaryAttribute) {
        const primaryDice = attributes[primaryAttribute]?.tick || 0;
        totalDice = primaryDice + diceMod;
        breakdown = `${attributes[primaryAttribute]?.label}: ${primaryDice}d6`;
      } else if (secondaryAttribute) {
        const secondaryDice = attributes[secondaryAttribute]?.tick || 0;
        totalDice = secondaryDice + diceMod;
        breakdown = `${attributes[secondaryAttribute]?.label}: ${secondaryDice}d6`;
      } else {
        breakdown = 'No attributes selected';
      }
    }

    if (diceMod !== 0) {
      const modText = diceMod > 0 ? `+${diceMod}` : `${diceMod}`;
      breakdown += ` ${modText} mod`;
    }

    totalDice = Math.max(0, totalDice);

    // Update the DOM elements
    const poolCountElement = this.element.querySelector('.pool-count');
    const poolBreakdownElement = this.element.querySelector('.pool-breakdown');
    const rollButtonDiceElement = this.element.querySelector('.dice-display');
    const rollButton = this.element.querySelector('.roll-button');

    if (poolCountElement) {
      poolCountElement.textContent = totalDice;
    }

    if (poolBreakdownElement) {
      poolBreakdownElement.textContent = breakdown;
    }

    if (rollButtonDiceElement) {
      rollButtonDiceElement.textContent = `${totalDice}d6`;
    }

    // Enable/disable roll button based on whether we can roll
    if (rollButton) {
      rollButton.disabled = totalDice === 0;
    }
  }

  async _prepareContext() {
    const attributes = {
      pow: {
        label: 'Power',
        tick: this.actor.system.attributes.pow?.tick || 1,
      },
      dex: {
        label: 'Dexterity',
        tick: this.actor.system.attributes.dex?.tick || 1,
      },
      will: {
        label: 'Willpower',
        tick: this.actor.system.attributes.will?.tick || 1,
      },
      sta: {
        label: 'Stamina',
        tick: this.actor.system.attributes.sta?.tick || 1,
      },
    };

    const skills = this.actor.system.skills || [];
    const availableSkills = skills.filter(
      (skill) => skill.name && skill.ticks > 0
    );

    // If a skill is selected but no governing attribute is set, auto-set it
    if (
      this.rollData.rollType === 'skill' &&
      this.rollData.selectedSkill &&
      !this.rollData.governingAttribute
    ) {
      const selectedSkill = availableSkills.find(
        (s) => s.name === this.rollData.selectedSkill
      );
      if (selectedSkill && selectedSkill.govern) {
        this.rollData.governingAttribute = selectedSkill.govern;
      }
    }

    // Calculate current dice pool
    let totalDice = 0;
    let breakdown = '';

    if (this.rollData.rollType === 'skill' && this.rollData.selectedSkill) {
      const skill = availableSkills.find(
        (s) => s.name === this.rollData.selectedSkill
      );
      if (skill) {
        const skillDice = skill.ticks || 0;
        // Use either the selected governing attribute or the skill's default
        const governingAttr =
          this.rollData.governingAttribute || skill.govern || 'dex';
        const attributeDice = attributes[governingAttr]?.tick || 0;
        totalDice = skillDice + attributeDice + this.rollData.diceMod;
        breakdown = `${skill.name}: ${skillDice}d6 + ${attributes[governingAttr]?.label}: ${attributeDice}d6`;
      }
    } else if (this.rollData.rollType === 'initiative') {
      // Set default initiative type if not set
      if (!this.rollData.initiativeType) {
        this.rollData.initiativeType = 'dex';
      }

      if (this.rollData.initiativeType === 'dex') {
        const dexTicks = attributes.dex?.tick || 1;
        totalDice = 2; // Only 2d6 are rolled
        const flatMod = dexTicks + this.rollData.diceMod;
        breakdown = `2d6 + ${dexTicks}${
          this.rollData.diceMod !== 0
            ? ` ${this.rollData.diceMod >= 0 ? '+' : ''}${
                this.rollData.diceMod
              }`
            : ''
        } (DEX ticks)`;
      } else if (
        this.rollData.initiativeType &&
        this.rollData.initiativeType.startsWith('skill:')
      ) {
        const skillName = this.rollData.initiativeType.substring(6); // Remove 'skill:' prefix
        const skill = availableSkills.find((s) => s.name === skillName);

        if (skill) {
          const skillTicks = skill.ticks || 0;
          totalDice = 2; // Only 2d6 are rolled
          const flatMod = skillTicks + this.rollData.diceMod;
          breakdown = `2d6 + ${skillTicks}${
            this.rollData.diceMod !== 0
              ? ` ${this.rollData.diceMod >= 0 ? '+' : ''}${
                  this.rollData.diceMod
                }`
              : ''
          } (${skill.name} ticks)`;
        }
      }
    } else {
      // Dual attribute check
      const primaryDice = attributes[this.rollData.primaryAttribute]?.tick || 0;
      const secondaryDice =
        attributes[this.rollData.secondaryAttribute]?.tick || 0;
      totalDice = primaryDice + secondaryDice + this.rollData.diceMod;

      if (this.rollData.primaryAttribute && this.rollData.secondaryAttribute) {
        breakdown = `${
          attributes[this.rollData.primaryAttribute]?.label
        }: ${primaryDice}d6 + ${
          attributes[this.rollData.secondaryAttribute]?.label
        }: ${secondaryDice}d6`;
      } else if (this.rollData.primaryAttribute) {
        breakdown = `${
          attributes[this.rollData.primaryAttribute]?.label
        }: ${primaryDice}d6`;
      } else if (this.rollData.secondaryAttribute) {
        breakdown = `${
          attributes[this.rollData.secondaryAttribute]?.label
        }: ${secondaryDice}d6`;
      } else {
        breakdown = 'No attributes selected';
      }
    }

    if (this.rollData.diceMod !== 0) {
      const modText =
        this.rollData.diceMod > 0
          ? `+${this.rollData.diceMod}`
          : `${this.rollData.diceMod}`;
      breakdown += ` ${modText} mod`;
    }

    // Check if actor is in active encounter for initiative availability
    const combat = game.combat;
    const isInEncounter =
      combat && combat.combatants.some((c) => c.actor?.id === this.actor.id);

    return {
      actor: {
        name: this.actor.name,
        img: this.actor.img,
      },
      rollData: this.rollData,
      attributes,
      skills: availableSkills,
      totalDice: Math.max(0, totalDice),
      breakdown,
      canRoll: totalDice > 0,
      isDaemon: this.rollData.isDaemon || false,
      isInEncounter: isInEncounter,
    };
  }

  static async _onSwitchType(event, target) {
    const newType = target.dataset.type;

    // Prevent switching to initiative if not in an encounter
    if (newType === 'initiative') {
      const combat = game.combat;
      const isInEncounter =
        combat && combat.combatants.some((c) => c.actor?.id === this.actor.id);
      if (!isInEncounter) {
        ui.notifications.warn(
          'Must be in an active encounter to roll initiative'
        );
        return;
      }
    }

    this.rollData.rollType = newType;

    // Reset selections when switching types
    if (newType === 'attribute') {
      this.rollData.selectedSkill = null;
      this.rollData.initiativeType = null;
    } else if (newType === 'skill') {
      this.rollData.primaryAttribute = 'pow';
      this.rollData.secondaryAttribute = 'dex';
      this.rollData.initiativeType = null;
    } else if (newType === 'initiative') {
      this.rollData.selectedSkill = null;
      this.rollData.primaryAttribute = 'pow';
      this.rollData.secondaryAttribute = 'dex';
      this.rollData.initiativeType = 'dex';
    }

    await this.render();
  }

  static async _onRoll(event, target) {
    // Find the form element
    const form = target.closest('form') || this.element.querySelector('form');
    const formData = new FormData(form);

    // Update roll data from form
    this.rollData.rollType = formData.get('rollType');
    this.rollData.primaryAttribute = formData.get('primaryAttribute');
    this.rollData.secondaryAttribute = formData.get('secondaryAttribute');
    this.rollData.selectedSkill = formData.get('selectedSkill');
    this.rollData.governingAttribute = formData.get('governingAttribute');
    this.rollData.initiativeType = formData.get('initiativeType');
    this.rollData.diceMod = parseInt(formData.get('diceMod')) || 0;
    this.rollData.label = formData.get('label') || '';

    try {
      // Prepare check data based on roll type
      let checkData = {};

      if (this.rollData.rollType === 'initiative') {
        // Handle initiative rolls - trigger the hook instead of using attribute check
        await Hooks.callAll('dasu.rollInitiativeWithSkill', this.actor, {
          initiativeType: this.rollData.initiativeType,
          diceMod: this.rollData.diceMod,
          label: this.rollData.label,
        });

        // Close the dialog
        this.close();
        return;
      } else if (
        this.rollData.rollType === 'skill' &&
        this.rollData.selectedSkill &&
        this.rollData.governingAttribute
      ) {
        // Find the selected skill
        const skills = this.actor.system.skills || [];
        const selectedSkill = skills.find(
          (s) => s.name === this.rollData.selectedSkill
        );

        if (selectedSkill) {
          // Override the skill's governing attribute with user selection
          const skillWithCustomAttribute = {
            ...selectedSkill,
            govern: this.rollData.governingAttribute,
          };

          checkData = {
            skill: skillWithCustomAttribute,
            diceMod: this.rollData.diceMod,
            customLabel: this.rollData.label,
          };
        }
      } else {
        // For dual attributes, we'll create a fake "attribute" that combines both
        // by calculating the total dice and using a combined label
        const primaryDice =
          this.actor.system.attributes[this.rollData.primaryAttribute]?.tick ||
          0;
        const secondaryDice =
          this.actor.system.attributes[this.rollData.secondaryAttribute]
            ?.tick || 0;
        const totalAttributeDice = primaryDice + secondaryDice;

        // Create a custom label that shows both attributes
        const attributeAbbr = {
          pow: 'PWR',
          dex: 'DEX',
          will: 'WILL',
          sta: 'STA',
        };

        const primaryLabel =
          attributeAbbr[this.rollData.primaryAttribute] ||
          this.rollData.primaryAttribute.toUpperCase();
        const secondaryLabel =
          attributeAbbr[this.rollData.secondaryAttribute] ||
          this.rollData.secondaryAttribute.toUpperCase();
        const combinedLabel =
          this.rollData.label || `${primaryLabel} + ${secondaryLabel}`;

        checkData = {
          attribute: 'combined', // Use a dummy attribute key
          totalAttributeDice: totalAttributeDice, // Pass the pre-calculated total
          diceMod: this.rollData.diceMod,
          customLabel: combinedLabel,
          primaryAttribute: {
            key: this.rollData.primaryAttribute,
            label: primaryLabel,
            dice: primaryDice,
          },
          secondaryAttribute: {
            key: this.rollData.secondaryAttribute,
            label: secondaryLabel,
            dice: secondaryDice,
          },
        };
      }

      // Create and execute the roll using new Checks API
      if (this.rollData.rollType === 'skill' && checkData.skill) {
        // Skill check
        const attributes = {
          primary: checkData.skill.govern,
          secondary: null,
        };

        const config = (check) => {
          if (checkData.diceMod) {
            check.modifiers.push({
              label: 'Dice Modifier',
              value: checkData.diceMod,
              source: 'dialog',
            });
          }
        };

        await Checks.skillCheck(
          this.actor,
          attributes,
          checkData.skill,
          config
        );
      } else {
        // Attribute check
        const attributes = {
          primary: this.rollData.primaryAttribute,
          secondary: this.rollData.secondaryAttribute,
        };

        const config = (check) => {
          if (checkData.diceMod) {
            check.modifiers.push({
              label: 'Dice Modifier',
              value: checkData.diceMod,
              source: 'dialog',
            });
          }
        };

        await Checks.attributeCheck(this.actor, attributes, config);
      }

      // Close the dialog
      this.close();
    } catch (error) {
      console.error('DASU Roll Dialog | Error executing roll:', error);
      ui.notifications.error(`Roll failed: ${error.message}`);
    }
  }

  static async _onCancel(event, target) {
    this.close();
  }

  /**
   * Static method to open attribute roll dialog
   */
  static async openAttributeDialog(actor, attributeKey = 'dex') {
    const dialog = new DASURollDialog(actor, {
      rollType: 'attribute',
      selectedAttribute: attributeKey,
    });

    return dialog.render(true);
  }

  /**
   * Static method to open skill roll dialog with auto-preset
   */
  static async openSkillDialog(actor, skillName = null) {
    const initialData = {
      rollType: 'skill',
    };

    if (skillName) {
      // Find the skill and auto-preset its governing attribute
      const skills = actor.system.skills || [];
      const selectedSkill = skills.find((s) => s.name === skillName);

      initialData.selectedSkill = skillName;
      if (selectedSkill && selectedSkill.govern) {
        initialData.governingAttribute = selectedSkill.govern;
      }
      // Don't set default if no govern - let the dialog handle it
    }

    const dialog = new DASURollDialog(actor, initialData);
    return dialog.render(true);
  }

  /**
   * Static method for compatibility with existing dataset handlers
   */
  static async openFromDataset(actor, dataset) {
    let initialData = {};

    if (dataset.roll && dataset.label) {
      const rollFormula = dataset.roll;
      const label = dataset.label;

      if (rollFormula.includes(' + ')) {
        // Skill check format: "3d6 + 2d6"
        const skillName = label.split(' Check')[0];
        initialData = {
          rollType: 'skill',
          selectedSkill: skillName,
          label: label,
        };
      } else {
        // Attribute check format: "3d6"
        // Use data-attribute if available, otherwise extract from label
        const attributeName =
          dataset.attribute || label.split(' Check')[0].toLowerCase();
        initialData = {
          rollType: 'attribute',
          selectedAttribute: attributeName,
          label: label,
        };
      }
    }

    // Pass through the isDaemon flag if present
    if (dataset.isDaemon) {
      initialData.isDaemon = true;
    }

    const dialog = new DASURollDialog(actor, initialData);
    return dialog.render(true);
  }
}
