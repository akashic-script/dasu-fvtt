import { ResistanceDataModel } from './resistance-data-model.mjs';

/**
 * Data model container for all resistance types in the DASU system.
 * Manages the eight elemental damage resistances with validation and derived data.
 *
 * @extends {foundry.abstract.DataModel}
 * @property {ResistanceDataModel} physical - Physical damage resistance
 * @property {ResistanceDataModel} fire - Fire damage resistance
 * @property {ResistanceDataModel} ice - Ice damage resistance
 * @property {ResistanceDataModel} electric - Electric damage resistance
 * @property {ResistanceDataModel} wind - Wind damage resistance
 * @property {ResistanceDataModel} earth - Earth damage resistance
 * @property {ResistanceDataModel} light - Light damage resistance
 * @property {ResistanceDataModel} dark - Dark damage resistance
 */
export class ResistancesDataModel extends foundry.abstract.DataModel {
  /**
   * Define the data schema for all resistance types
   * @returns {Object} The schema definition with all eight resistance types
   */
  static defineSchema() {
    const { EmbeddedDataField } = foundry.data.fields;
    return {
      physical: new EmbeddedDataField(ResistanceDataModel, {}),
      fire: new EmbeddedDataField(ResistanceDataModel, {}),
      ice: new EmbeddedDataField(ResistanceDataModel, {}),
      electric: new EmbeddedDataField(ResistanceDataModel, {}),
      wind: new EmbeddedDataField(ResistanceDataModel, {}),
      earth: new EmbeddedDataField(ResistanceDataModel, {}),
      light: new EmbeddedDataField(ResistanceDataModel, {}),
      dark: new EmbeddedDataField(ResistanceDataModel, {}),
    };
  }

  static LOCALIZATION_PREFIXES = ['DASU.RESISTANCES'];

  /**
   * Get all resistance types as an array
   * @returns {string[]} Array of resistance type names
   */
  static get RESISTANCE_TYPES() {
    return [
      'physical',
      'fire',
      'ice',
      'electric',
      'wind',
      'earth',
      'light',
      'dark',
    ];
  }

  /**
   * Joint validation for cross-resistance logic
   * Ensures all resistance values are within valid ranges
   * @param {Object} [options={}] - Validation options
   * @throws {Error} If cross-resistance validation fails
   */
  validateJoint(options = {}) {
    super.validateJoint?.(options);

    // Validate all resistance values are within acceptable range
    const resistanceValues = Object.values(this)
      .map((r) => r?.base)
      .filter((v) => v !== undefined);
    const hasInvalidCombination = resistanceValues.some(
      (val) => val < -1 || val > 3
    );

    if (hasInvalidCombination) {
      throw new Error('Invalid resistance combination detected');
    }
  }

  /**
   * Prepare derived data for resistance calculations
   * Adds derived properties for tracking effective values and modifications
   */
  prepareDerivedData() {
    // Calculate derived values for each resistance
    for (const resistance of Object.values(this)) {
      if (resistance instanceof ResistanceDataModel) {
        // Add derived calculation properties
        resistance._derived = {
          effectiveValue: resistance.current,
          isModified: resistance.current !== resistance.base,
        };
      }
    }
  }
}
