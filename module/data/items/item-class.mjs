import BaseItemDataModel from './item-base.mjs';

export default class ClassDataModel extends BaseItemDataModel {
  static LOCALIZATION_PREFIXES = ['DASU.Item.class'];

  static defineSchema() {
    const fields = foundry.data.fields;
    const baseSchema = super.defineSchema();

    return {
      ...baseSchema,

      // Core class properties
      version: new fields.StringField({
        required: true,
        initial: '1.0.0',
      }),
      category: new fields.StringField({
        required: true,
        choices: globalThis.DASU?.CLASS_CATEGORIES || [
          'official',
          'homebrew',
          'community',
        ],
        initial: 'official',
      }),

      // Starting attributes (must total 4)
      startingAttributes: new fields.SchemaField({
        pow: new fields.NumberField({
          required: true,
          initial: 1,
          min: 0,
          max: 4,
        }),
        dex: new fields.NumberField({
          required: true,
          initial: 1,
          min: 0,
          max: 4,
        }),
        will: new fields.NumberField({
          required: true,
          initial: 1,
          min: 0,
          max: 4,
        }),
        sta: new fields.NumberField({
          required: true,
          initial: 1,
          min: 0,
          max: 4,
        }),
      }),

      // Progression formulas
      progression: new fields.SchemaField({
        apFormula: new fields.StringField({
          required: true,
          initial: 'odd:1-29',
        }),
        // 2+2*level
        spFormula: new fields.StringField({
          required: true,
          initial: '2',
        }),
        customFormulas: new fields.ObjectField({
          required: false,
          initial: {},
        }),
      }),

      // Level slot definitions - what types of slots are available at each level
      levelSlots: new fields.ObjectField({
        required: false,
        initial: {},
        // Structure:
        // Simple slots: { "1": ["aptitude"], "2": ["skill"], "3": ["attribute", "feature"], ... }
        // Schema slots: { "1": [{ type: "schema", schemaId: "fireSchema", action: "new" }], ... }
        // Where action can be "new" (new schema) or "upgrade" (increase existing schema level)
      }),

      // Schema version for compatibility
      schemaVersion: new fields.StringField({
        required: false,
        initial: '1.0',
      }),
    };
  }

  prepareDerivedData() {
    super.prepareDerivedData();

    // Validate starting attributes total to 4
    this.validateStartingAttributes();

    // Calculate progression totals for common levels
    this.calculateProgression();
  }

  /**
   * Validate that starting attributes total exactly 4 points
   */
  validateStartingAttributes() {
    const { pow, dex, will, sta } = this.startingAttributes;
    const total = pow + dex + will + sta;

    this.startingAttributesValid = total === 4;
    this.startingAttributesTotal = total;

    // Ensure each attribute is at least 0
    const hasNegative = [pow, dex, will, sta].some((attr) => attr < 0);
    this.startingAttributesValid = this.startingAttributesValid && !hasNegative;
  }

  /**
   * Calculate progression values for common levels (1, 5, 10, 15, 20, 25, 30)
   */
  calculateProgression() {
    const commonLevels = [1, 5, 10, 15, 20, 25, 30];
    this.progressionSamples = {};

    for (const level of commonLevels) {
      this.progressionSamples[level] = {
        ap: this.evaluateFormula(this.progression.apFormula, level),
        sp: this.evaluateFormula(this.progression.spFormula, level),
      };
    }
  }

  /**
   * Evaluate a progression formula for a given level
   * @param {string} formula - The formula to evaluate
   * @param {number} level - The character level
   * @returns {number} - The calculated value
   */
  evaluateFormula(formula, level) {
    try {
      // Handle special formula formats
      if (formula.includes('odd:')) {
        const match = formula.match(/odd:(\d+)-(\d+)/);
        if (match) {
          const start = parseInt(match[1]);
          const end = parseInt(match[2]);
          return level >= start && level <= end && level % 2 === 1 ? 1 : 0;
        }
      }

      if (formula.includes('even:')) {
        const match = formula.match(/even:(\d+)-(\d+)/);
        if (match) {
          const start = parseInt(match[1]);
          const end = parseInt(match[2]);
          return level >= start && level <= end && level % 2 === 0 ? 1 : 0;
        }
      }

      // Replace 'level' with actual level value and evaluate
      const expression = formula.replace(/level/g, level.toString());

      // Simple evaluation for basic mathematical expressions
      // Only allow numbers, operators, and parentheses for security
      if (!/^[\d+\-*/()s.]+$/.test(expression)) {
        console.warn(`Invalid formula: ${formula}`);
        return 0;
      }

      return Math.floor(eval(expression)) || 0;
    } catch (error) {
      console.warn(
        `Error evaluating formula "${formula}" for level ${level}:`,
        error
      );
      return 0;
    }
  }

  /**
   * Calculate total AP gained from level 1 to specified level
   * @param {number} level - The target level
   * @returns {number} - Total AP gained
   */
  calculateTotalAP(level) {
    let total = 0;
    for (let i = 1; i <= level; i++) {
      total += this.evaluateFormula(this.progression.apFormula, i);
    }
    return total;
  }

  /**
   * Calculate total SP gained from level 1 to specified level
   * @param {number} level - The target level
   * @returns {number} - Total SP gained
   */
  calculateTotalSP(level) {
    let total = 0;
    for (let i = 1; i <= level; i++) {
      total += this.evaluateFormula(this.progression.spFormula, i);
    }
    return total;
  }

  /**
   * Check if a schema is allowed by this class
   * @param {string} schemaId - The schema ID to check
   * @returns {boolean} - Whether the schema is allowed
   */
  isSchemaAllowed(schemaId) {
    const { allowedSchemas, forbiddenSchemas } = this.restrictions;

    // If specific schemas are allowed, check against that list
    if (allowedSchemas && allowedSchemas.length > 0) {
      return allowedSchemas.includes(schemaId);
    }

    // If no specific allow list, check forbidden list
    if (forbiddenSchemas && forbiddenSchemas.length > 0) {
      return !forbiddenSchemas.includes(schemaId);
    }

    // If no restrictions, allow all schemas
    return true;
  }

  /**
   * Validate the entire class structure
   * @returns {Array} - Array of validation errors
   */
  validateClass() {
    const errors = [];

    // Check starting attributes
    if (!this.startingAttributesValid) {
      errors.push(
        `Starting attributes must total 4 points (currently ${this.startingAttributesTotal})`
      );
    }

    // Check required formulas
    if (!this.progression.apFormula) {
      errors.push('AP formula is required');
    }

    if (!this.progression.spFormula) {
      errors.push('SP formula is required');
    }

    return errors;
  }
}
