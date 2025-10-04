import { MathHelper } from '../../utils/math-helper.mjs';

/**
 * Data model for individual resistance values in the DASU system.
 * Handles resistance states from -1 (weak) to 3 (drain) with Active Effects support.
 *
 * @extends {foundry.abstract.DataModel}
 * @property {number} base - Base resistance value (-1 to 3)
 * @property {number} current - Current effective resistance value (includes Active Effects)
 * @property {boolean} weak - True if resistance is at weak level (-1)
 * @property {boolean} resist - True if resistance is at resist level (1)
 * @property {boolean} nullify - True if resistance is at nullify level (2)
 * @property {boolean} drain - True if resistance is at drain level (3)
 */
export class ResistanceDataModel extends foundry.abstract.DataModel {
  /**
   * Define the data schema for resistance values
   * @returns {Object} The schema definition
   */
  static defineSchema() {
    const { NumberField } = foundry.data.fields;
    return {
      base: new NumberField({
        initial: 0,
        min: -1,
        max: 3,
        integer: true,
        nullable: false,
      }),
    };
  }

  static LOCALIZATION_PREFIXES = ['DASU.RESISTANCE'];

  /**
   * Validate that resistance values are within acceptable range
   * @param {Object} [options={}] - Validation options
   * @throws {foundry.data.validation.DataModelValidationFailure} If validation fails
   */
  validate(options = {}) {
    super.validate(options);
    if (this.base < -1 || this.base > 3) {
      throw new foundry.data.validation.DataModelValidationFailure({
        message: `Resistance base value ${this.base} must be between -1 and 3`,
        field: 'base',
      });
    }
  }

  /**
   * Prepare derived data for this resistance instance
   * Calculates the effective damage multiplier based on current resistance value
   */
  prepareDerivedData() {
    Object.defineProperty(this, '_effectiveMultiplier', {
      value: this._calculateDamageMultiplier(),
      configurable: true,
      enumerable: false,
    });
  }

  /**
   * Calculate damage multiplier based on current resistance value
   * @returns {number} Damage multiplier for this resistance level
   * @private
   */
  _calculateDamageMultiplier() {
    switch (this.current) {
      case -1:
        return 2; // Weak: double damage
      case 0:
        return 1; // Normal: normal damage
      case 1:
        return 0.5; // Resist: half damage
      case 2:
        return 0; // Nullify: no damage
      case 3:
        return -1; // Drain: healing
      default:
        return 1;
    }
  }

  /**
   * Constructor for ResistanceDataModel
   * Sets up dynamic properties for current value calculation and Active Effects handling
   * @param {Object} data - Initial data for the resistance
   * @param {Object} options - Construction options
   */
  constructor(data, options) {
    super(data, options);

    /**
     * Internal state for Active Effect modifications
     * @type {Object}
     * @private
     */
    this._effectModifications = {
      weak: false,
      resist: false,
      nullify: false,
      drain: false,
    };

    // Define the dynamic 'current' property that includes Active Effect modifications
    Object.defineProperty(this, 'current', {
      configurable: true,
      enumerable: true,
      /**
       * Get the current effective resistance value
       * Prioritizes Active Effect modifications over base value
       * @returns {number} Current resistance value (-1 to 3)
       */
      get: () => {
        // Check Active Effect modifications first (highest priority)
        if (this._effectModifications.drain) return 3;
        if (this._effectModifications.nullify) return 2;
        if (this._effectModifications.resist && this._effectModifications.weak)
          return 0;
        if (this._effectModifications.resist) return 1;
        if (this._effectModifications.weak) return -1;

        // Fall back to base value if no Active Effects
        return this.base;
      },
      /**
       * Set the current resistance value
       * Updates internal effect modifications to reflect the new value
       * @param {number} newValue - New resistance value to set
       */
      set: (newValue) => {
        // Reset all effect modifications
        this._effectModifications = {
          weak: false,
          resist: false,
          nullify: false,
          drain: false,
        };

        // Set the appropriate effect modification based on the new value
        const value = MathHelper.clamp(newValue, -1, 3);
        switch (value) {
          case -1:
            this._effectModifications.weak = true;
            break;
          case 1:
            this._effectModifications.resist = true;
            break;
          case 2:
            this._effectModifications.nullify = true;
            break;
          case 3:
            this._effectModifications.drain = true;
            break;
          // case 0 (normal) requires no modifications
        }
      },
    });

    // Define state flag properties (read-only)
    Object.defineProperty(this, 'weak', {
      configurable: true,
      enumerable: true,
      /**
       * Check if resistance is currently at weak level
       * @returns {boolean} True if weak (from effects or base value)
       */
      get: () => this._effectModifications.weak || this.base === -1,
    });

    Object.defineProperty(this, 'resist', {
      configurable: true,
      enumerable: true,
      /**
       * Check if resistance is currently at resist level
       * @returns {boolean} True if resist (from effects or base value)
       */
      get: () => this._effectModifications.resist || this.base === 1,
    });

    Object.defineProperty(this, 'nullify', {
      configurable: true,
      enumerable: true,
      /**
       * Check if resistance is currently at nullify level
       * @returns {boolean} True if nullify (from effects or base value)
       */
      get: () => this._effectModifications.nullify || this.base === 2,
    });

    Object.defineProperty(this, 'drain', {
      configurable: true,
      enumerable: true,
      /**
       * Check if resistance is currently at drain level
       * @returns {boolean} True if drain (from effects or base value)
       */
      get: () => this._effectModifications.drain || this.base === 3,
    });

    // Define method functions for resistance manipulation
    Object.defineProperty(this, 'downgrade', {
      value: () => {
        this._effectModifications.weak = true;
      },
    });

    Object.defineProperty(this, 'upgrade', {
      value: () => {
        this._effectModifications.resist = true;
      },
    });

    // Create method aliases for easier resistance manipulation

    // Weakness method aliases (weak, wk)
    ['weak', 'wk'].forEach((methodName) => {
      Object.defineProperty(this, methodName, {
        value: () => {
          this._effectModifications.weak = true;
        },
      });
    });

    // Resistance method aliases (resist, rs)
    ['resist', 'rs'].forEach((methodName) => {
      Object.defineProperty(this, methodName, {
        value: () => {
          this._effectModifications.resist = true;
        },
      });
    });

    // Nullification method aliases (nullify, nu)
    ['nullify', 'nu'].forEach((methodName) => {
      Object.defineProperty(this, methodName, {
        value: () => {
          this._effectModifications.nullify = true;
        },
      });
    });

    // Drain method aliases (drain, dr)
    ['drain', 'dr'].forEach((methodName) => {
      Object.defineProperty(this, methodName, {
        value: () => {
          this._effectModifications.drain = true;
        },
      });
    });
  }
}
