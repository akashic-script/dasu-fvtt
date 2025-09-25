/**
 * DASU Accuracy Roll Class v1
 * Handles initialization, processing, and rendering of item rolls
 * Uses 2d6 + modifier system (total-based, not success-counting)
 * Supports weapons (toHit), abilities (toHit), and tactics (toLand)
 */

export class DASUAccuracyRollV1 {
  constructor(item, actor = null, options = {}) {
    this.item = item;
    this.actor = actor || item.actor;
    this.options = {
      rollMode: options.rollMode || game.settings.get('core', 'rollMode'),
      ...options,
    };

    // Roll data storage
    this.rollData = null;
    this.roll = null;
    this.processed = false;
    this.rendered = false;
  }

  /**
   * Initialize the roll - determine type, bonus, and base roll formula
   */
  initialize() {
    if (!this.item || !this.actor) {
      throw new Error('DASUAccuracyRollV1 requires both item and actor');
    }

    // Determine item type and appropriate bonus field
    let bonus = 0;
    let rollType = '';
    let rollLabel = '';

    switch (this.item.type) {
      case 'weapon':
        bonus = this.item.system.toHit || 0;
        rollType = 'weapon';
        rollLabel = `${this.item.name}`;
        break;

      case 'ability':
        bonus = this.item.system.toHit || 0;
        rollType = 'ability';
        rollLabel = `${this.item.name}`;
        break;

      case 'tactic':
        bonus = this.item.system.toLand || 0;
        rollType = 'tactic';
        rollLabel = `${this.item.name}`;
        break;

      default:
        throw new Error(`Unsupported item type for rolling: ${this.item.type}`);
    }

    // Apply any bonus modifier from dialog
    const bonusModifier = this.options.bonusModifier || 0;
    const totalBonus = bonus + bonusModifier;

    // Build roll formula based on roll mechanism
    const rollMechanic = this.options.rollType || 'normal';
    let formula;
    switch (rollMechanic) {
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

    // Use custom label if provided
    const customLabel = this.options.customLabel;
    if (customLabel) {
      rollLabel = customLabel;
    }

    this.rollData = {
      formula,
      bonus,
      bonusModifier,
      totalBonus,
      rollType,
      rollLabel,
      rollMechanic: rollMechanic, // Store the roll mechanism (normal/advantage/disadvantage)
      item: {
        id: this.item.id,
        name: this.item.name,
        type: this.item.type,
        img: this.item.img,
        system: foundry.utils.deepClone(this.item.system),
      },
      actor: {
        id: this.actor.id,
        name: this.actor.name,
        type: this.actor.type,
        img: this.actor.img,
      },
    };

    return this;
  }

  /**
   * Process the roll - execute dice roll and calculate results
   */
  async process() {
    if (!this.rollData) {
      this.initialize();
    }

    try {
      // Create and evaluate the roll
      this.roll = new Roll(this.rollData.formula);
      await this.roll.evaluate();

      // Get dice results for display and check for crits
      let rollResults = [];
      let allDiceResults = []; // All dice rolled (including dropped ones for advantage)
      let diceWithStatus = []; // Dice with their active/dropped status
      let critThreshold = this.actor.system.stats?.crit?.value ?? 7;
      let hasCrit = false;

      for (const term of this.roll.terms) {
        if (term instanceof foundry.dice.terms.Die) {
          // Get all dice results, including discarded ones
          for (const result of term.results) {
            allDiceResults.push(result.result);
            diceWithStatus.push({
              value: result.result,
              active: result.active !== false,
              dropped: result.active === false,
            });
            // Only include active (non-discarded) dice in rollResults for display
            if (result.active !== false) {
              rollResults.push(result.result);
            }
          }
        }
      }

      // Check for crit based on roll mechanism
      const rollMechanic = this.rollData.rollMechanic;

      if (rollMechanic === 'advantage') {
        // For advantage: check if any 2+ dice (including dropped ones) are the same and >= crit threshold
        if (allDiceResults.length >= 2) {
          const diceAtOrAboveThreshold = allDiceResults.filter(
            (result) => result >= critThreshold
          );
          const valueCounts = {};
          for (const die of diceAtOrAboveThreshold) {
            valueCounts[die] = (valueCounts[die] || 0) + 1;
            if (valueCounts[die] >= 2) {
              hasCrit = true;
              break;
            }
          }
        }
      } else {
        // For normal and disadvantage: check if any two dice of the same value are both at or above the crit threshold
        if (rollResults.length >= 2) {
          const diceAtOrAboveThreshold = rollResults.filter(
            (result) => result >= critThreshold
          );
          const valueCounts = {};
          for (const die of diceAtOrAboveThreshold) {
            valueCounts[die] = (valueCounts[die] || 0) + 1;
            if (valueCounts[die] >= 2) {
              hasCrit = true;
              break;
            }
          }
        }
      }

      // Enhanced roll data with results
      this.rollData.results = {
        total: this.roll.total,
        rollResults,
        allDiceResults,
        diceWithStatus,
        formula: this.roll.formula,
        dice: this.roll.dice.map((d) => ({
          faces: d.faces,
          results: d.results.map((r) => r.result),
        })),
        crit: {
          hasCrit,
          threshold: critThreshold,
        },
      };

      // Add item-specific result data
      this._processItemSpecificResults();

      this.processed = true;
      return this;
    } catch (error) {
      console.error('DASU Roll | Error processing roll:', error);
      throw error;
    }
  }

  /**
   * Process item-specific results (damage, effects, etc.)
   */
  _processItemSpecificResults() {
    const { item } = this.rollData;

    switch (item.type) {
      case 'weapon':
        if (item.system.damage) {
          this.rollData.results.damage = {
            value: item.system.damage.value || 0,
            type: item.system.damage.type || 'physical',
          };
        }
        break;

      case 'ability':
        this.rollData.results.cost = {
          value: item.system.cost || 0,
          type: item.system.costType || 'wp',
        };
        if (item.system.damage) {
          this.rollData.results.damage = {
            value: item.system.damage.value || 0,
            type: item.system.damage.type || 'physical',
          };
        }
        if (item.system.healed && item.system.healed.value) {
          this.rollData.results.healing = {
            value: item.system.healed.value,
            type: item.system.healed.type || 'hp',
          };
        }
        break;

      case 'tactic':
        this.rollData.results.cost = {
          value: item.system.cost || 0,
          type: 'wp', // Tactics always cost WP
        };
        if (item.system.damage) {
          this.rollData.results.damage = {
            value: item.system.damage.value || 0,
            type: item.system.damage.type || 'physical',
          };
        }
        if (item.system.effect) {
          this.rollData.results.effect = item.system.effect;
        }
        break;
    }
  }

  /**
   * Render the roll as a chat message
   */
  async render() {
    if (!this.processed) {
      await this.process();
    }

    try {
      // Prepare template data
      const templateData = {
        roll: this.rollData,
        rollMode: this.options.rollMode,
        timestamp: new Date().toISOString(),
        user: game.user,
        // Helper flags for template rendering
        isWeapon: this.rollData.item.type === 'weapon',
        isAbility: this.rollData.item.type === 'ability',
        isTactic: this.rollData.item.type === 'tactic',
        hasCrit: this.rollData.results.crit.hasCrit,
        critThreshold: this.rollData.results.crit.threshold,
      };

      // Render template
      const html = await foundry.applications.handlebars.renderTemplate(
        'systems/dasu/templates/chat/roll-card.hbs',
        templateData
      );

      // Create chat message
      const chatData = {
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: html,
        rolls: [this.roll],
        rollMode: this.options.rollMode,
        flags: {
          dasu: {
            rollType: this.rollData.rollType,
            itemId: this.rollData.item.id,
            actorId: this.rollData.actor.id,
            rollData: this.rollData,
          },
        },
      };

      // Create and return the chat message
      const message = await ChatMessage.create(chatData);
      this.rendered = true;

      return message;
    } catch (error) {
      console.error('DASU Accuracy Roll | Error rendering roll:', error);
      throw error;
    }
  }

  /**
   * Static method to quickly roll an item
   */
  static async rollItem(item, actor = null, options = {}) {
    const roll = new DASUAccuracyRollV1(item, actor, options);
    return await roll.render();
  }

  /**
   * Get roll data for external use
   */
  getRollData() {
    return this.rollData;
  }

  /**
   * Get the foundry Roll object
   */
  getRoll() {
    return this.roll;
  }

  /**
   * Check if roll meets a target number
   */
  meetsTarget(targetNumber) {
    return this.processed && this.rollData.results.total >= targetNumber;
  }

  /**
   * Get total roll result
   */
  getTotal() {
    return this.processed ? this.rollData.results.total : 0;
  }
}
