/**
 * DASU Attribute Check Class v1
 * Handles initialization, processing, and rendering of attribute and skill checks
 * Uses success-based system where 4-6 on each d6 counts as 1 success
 * Supports pure attribute checks and attribute + skill checks
 */

export class DASUAttributeCheckV1 {
  constructor(actor, checkData, options = {}) {
    this.actor = actor;
    this.checkData = checkData;
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
   * Initialize the check - determine dice pool and formula
   */
  initialize() {
    if (!this.actor) {
      throw new Error('DASUAttributeCheckV1 requires an actor');
    }

    // Validate check data structure
    if (
      !this.checkData ||
      (!this.checkData.attribute && !this.checkData.skill)
    ) {
      throw new Error(
        'DASUAttributeCheckV1 requires either attribute or skill check data'
      );
    }

    let formula = '';
    let label = '';
    let attributeDice = 0;
    let skillDice = 0;
    let diceMod = this.checkData.diceMod || 0;
    let totalDice = 0;

    if (this.checkData.skill) {
      // Skill check: skill dice + governing attribute dice + modifiers
      const skill = this.checkData.skill;
      const governingAttribute = skill.govern || 'dex'; // default to dex if not specified

      skillDice = skill.ticks || 0;
      attributeDice =
        this.actor.system.attributes[governingAttribute]?.tick || 1;
      totalDice = Math.max(0, skillDice + attributeDice + diceMod);

      // Build formula - roll all dice together for success counting
      formula = `${totalDice}d6`;
      label =
        this.checkData.customLabel ||
        `${
          skill.name
        } Check (${governingAttribute.toUpperCase()}: ${attributeDice} + Skill: ${skillDice}${
          diceMod !== 0 ? ` ${diceMod >= 0 ? '+' : ''}${diceMod}` : ''
        })`;
    } else if (this.checkData.attribute) {
      // Pure attribute check or dual attribute check
      const attributeKey = this.checkData.attribute;

      if (this.checkData.totalAttributeDice !== undefined) {
        // Dual attribute check - use pre-calculated total
        attributeDice = this.checkData.totalAttributeDice;
      } else {
        // Single attribute check
        attributeDice = this.actor.system.attributes[attributeKey]?.tick || 1;
      }

      totalDice = Math.max(0, attributeDice + diceMod);

      formula = `${totalDice}d6`;
      label =
        this.checkData.customLabel ||
        `${attributeKey.toUpperCase()} Check (${attributeDice} dice${
          diceMod !== 0 ? ` ${diceMod >= 0 ? '+' : ''}${diceMod}` : ''
        })`;
    }

    this.rollData = {
      formula,
      label,
      attributeDice,
      skillDice,
      diceMod,
      totalDice,
      checkType: this.checkData.skill ? 'skill' : 'attribute',
      attributeName: this.checkData.skill
        ? this.checkData.skill.govern || 'dex'
        : this.checkData.attribute,
      skillName: this.checkData.skill?.name || null,
      primaryAttribute: this.checkData.primaryAttribute || null,
      secondaryAttribute: this.checkData.secondaryAttribute || null,
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
   * Process the roll - execute dice roll and calculate successes
   */
  async process() {
    if (!this.rollData) {
      this.initialize();
    }

    try {
      // Create and evaluate the roll
      this.roll = new Roll(this.rollData.formula, this.actor.getRollData());
      await this.roll.evaluate();

      // Calculate successes (4-6 on each die), collect results, and check for crits
      let successes = 0;
      let rollResults = [];
      let critThreshold = this.actor.system.stats?.crit?.value ?? 7;
      let hasCrit = false;

      // Since we roll all dice together now, just collect all results and count successes
      if (this.roll.dice && this.roll.dice.length > 0) {
        for (const die of this.roll.dice) {
          if (die.results) {
            for (const result of die.results) {
              rollResults.push(result.result);
              if (result.result >= 4 && result.result <= 6) {
                successes++;
              }
            }
          }
        }
      }

      // Check for crit: any two dice of the same value that are both at or above the crit threshold
      if (rollResults.length >= 2) {
        const diceAtOrAboveThreshold = rollResults.filter(
          (result) => result >= critThreshold
        );
        // Count occurrences of each die value at or above threshold
        const valueCounts = {};
        for (const die of diceAtOrAboveThreshold) {
          valueCounts[die] = (valueCounts[die] || 0) + 1;
          // If we have two or more dice of the same value at/above threshold, it's a crit
          if (valueCounts[die] >= 2) {
            hasCrit = true;
            break;
          }
        }
      }

      // For display purposes, we'll simulate the breakdown of dice sources
      // This helps with the template display even though we rolled them together
      let attributeResults = [];
      let skillResults = [];

      if (this.rollData.checkType === 'skill') {
        // Split results for display (first X are skill, next Y are attribute, rest are modifiers)
        skillResults = rollResults.slice(0, this.rollData.skillDice);
        attributeResults = rollResults.slice(
          this.rollData.skillDice,
          this.rollData.skillDice + this.rollData.attributeDice
        );
        // Any remaining dice are from modifiers and get added to the display pool
      } else {
        // All dice are attribute-based (including modifiers)
        attributeResults = rollResults;
      }

      // Enhanced roll data with results
      this.rollData.results = {
        successes,
        rollResults,
        attributeResults,
        skillResults,
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

      this.processed = true;
      return this;
    } catch (error) {
      console.error('DASU Attribute Check | Error processing roll:', error);
      throw error;
    }
  }

  /**
   * Render the check as a chat message
   */
  async render() {
    if (!this.processed) {
      await this.process();
    }

    try {
      // Prepare template data
      const templateData = {
        check: this.rollData,
        rollMode: this.options.rollMode,
        timestamp: new Date().toISOString(),
        user: game.user,
        // Helper flags for template rendering
        isSkillCheck: this.rollData.checkType === 'skill',
        isAttributeCheck: this.rollData.checkType === 'attribute',
        hasSuccesses: this.rollData.results.successes > 0,
        hasCrit: this.rollData.results.crit.hasCrit,
        critThreshold: this.rollData.results.crit.threshold,
        successLevel: this._getSuccessLevel(),
        resultClass: this._getResultClass(),
      };

      // Render template
      const html = await foundry.applications.handlebars.renderTemplate(
        'systems/dasu/templates/chat/attribute-check-card.hbs',
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
            rollType: 'attributeCheck',
            checkType: this.rollData.checkType,
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
      console.error('DASU Attribute Check | Error rendering roll:', error);
      throw error;
    }
  }

  /**
   * Get success level description
   */
  _getSuccessLevel() {
    const successes = this.rollData.results.successes;
    if (successes === 0) return 'failure';
    if (successes === 1) return 'partial';
    if (successes === 2) return 'success';
    if (successes >= 3) return 'critical';
    return 'success';
  }

  /**
   * Get CSS class for result styling
   */
  _getResultClass() {
    const successes = this.rollData.results.successes;
    if (successes === 0) return 'failure';
    if (successes === 1) return 'partial-success';
    if (successes === 2) return 'success';
    if (successes >= 3) return 'critical-success';
    return 'success';
  }

  /**
   * Static method to quickly roll an attribute check
   */
  static async rollAttribute(actor, attributeKey, options = {}) {
    const checkData = { attribute: attributeKey };
    const check = new DASUAttributeCheckV1(actor, checkData, options);
    return await check.render();
  }

  /**
   * Static method to quickly roll a skill check
   */
  static async rollSkill(actor, skill, options = {}) {
    const checkData = { skill };
    const check = new DASUAttributeCheckV1(actor, checkData, options);
    return await check.render();
  }

  /**
   * Static method for compatibility with existing roll handlers
   */
  static async handleRollFromDataset(actor, dataset, options = {}) {
    if (!dataset.roll || !dataset.label) {
      throw new Error('Invalid dataset for attribute check');
    }

    let checkData = {};

    // Parse the roll formula to determine type
    const rollFormula = dataset.roll;
    const label = dataset.label;

    if (rollFormula.includes(' + ')) {
      // Skill check format: "3d6 + 2d6"
      const parts = rollFormula.split(' + ');
      const skillDice = parseInt(parts[0]) || 0;
      const attributeDice = parseInt(parts[1]) || 0;

      // Extract skill name from label
      const skillName = label.split(' Check')[0];

      // Try to find the actual skill data
      const skills = actor.system.skills || [];
      const foundSkill = skills.find((s) => s.name === skillName);

      if (foundSkill) {
        checkData = { skill: foundSkill };
      } else {
        // Create minimal skill data
        checkData = {
          skill: {
            name: skillName,
            ticks: skillDice,
            govern: 'dex', // default
          },
        };
      }
    } else {
      // Attribute check format: "3d6"
      const attributeDice = parseInt(rollFormula) || 0;

      // Extract attribute from label
      const labelParts = label.split(' Check');
      const attributeName = labelParts[0].toLowerCase();

      checkData = { attribute: attributeName };
    }

    const check = new DASUAttributeCheckV1(actor, checkData, options);
    return await check.render();
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
   * Check if roll was successful (has any successes)
   */
  isSuccess() {
    return this.processed && this.rollData.results.successes > 0;
  }

  /**
   * Get number of successes
   */
  getSuccesses() {
    return this.processed ? this.rollData.results.successes : 0;
  }

  /**
   * Check if roll meets a success threshold
   */
  meetsThreshold(threshold) {
    return this.processed && this.rollData.results.successes >= threshold;
  }
}
