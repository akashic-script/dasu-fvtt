/**
 * Damage Calculator for DASU System
 *
 * Implements the core DASU damage calculation formula and resistance rules:
 * - Base Damage = Governing Attribute Tick + Weapon/Item Damage
 * - Governing attribute is determined by item's 'govern' field, falls back to POW
 * - Resistance modifies final damage based on target's resistance values
 * - Critical hits are applied during resistance calculations:
 *   - Normal (0): 2x on crit
 *   - Weak (-1): 4x on crit, 2x normally
 *   - Resist (1): 1x on crit, 0.5x normally
 *   - Drain (3): -2x on crit, -1x normally
 *
 * @example
 * // Calculate base damage
 * const baseDamage = DamageCalculator.calculateBaseDamage(sourceActor, weapon);
 *
 * // Apply resistance with crit
 * const result = DamageCalculator.applyResistance(baseDamage, targetActor, 'fire', true);
 */

/**
 * Static utility class for damage calculations
 */
export class DamageCalculator {
  /**
   * Calculate base damage using DASU mechanics
   *
   * DASU Formula: Base Damage = Item Damage + Governing Attribute Tick
   *
   * Priority for determining governing attribute:
   * 1. modifiers.attributeTick (dialog/override selection)
   * 2. sourceItem.system.govern (item's default governing attribute)
   * 3. 'pow' (fallback default)
   *
   * @param {Actor} sourceActor - The actor dealing damage
   * @param {Item} [sourceItem] - The weapon or item being used (govern field determines attribute)
   * @param {Object} [modifiers={}] - Damage modifiers
   * @param {boolean} [modifiers.isCritical=false] - Whether this is a critical hit
   * @param {number} [modifiers.bonus=0] - Additional damage bonus
   * @param {number} [modifiers.multiplier=1] - Damage multiplier
   * @param {string} [modifiers.attributeTick='pow'] - Override for attribute tick (dialog selection)
   * @returns {number} Calculated base damage
   */
  static calculateBaseDamage(sourceActor, sourceItem, modifiers = {}) {
    // Validate inputs
    if (!sourceActor) {
      return 0;
    }

    // Get attribute tick - prioritize modifier override (dialog selection) over item's govern field
    // If govern is null, empty string, or 'none', don't add attribute tick
    const governField = sourceItem?.system?.govern;
    let attributeTick;

    if ('attributeTick' in modifiers) {
      // Use the explicit value from modifiers (could be null, '', or a value)
      attributeTick = modifiers.attributeTick;
    } else if (governField !== undefined) {
      attributeTick = governField;
    } else {
      // Default fallback
      attributeTick = 'pow';
    }

    // Check if we should skip attribute tick
    const shouldSkipAttributeTick =
      attributeTick === null ||
      attributeTick === '' ||
      attributeTick === 'none';

    // Safely get tick value with fallback
    let tickValue = 0;
    if (!shouldSkipAttributeTick) {
      tickValue = 1; // Default tick value
      if (sourceActor.system?.attributes?.[attributeTick]?.tick) {
        tickValue = sourceActor.system.attributes[attributeTick].tick;
      } else if (sourceActor.system?.attributes?.[attributeTick]?.current) {
        // Fallback: calculate tick from current value (DASU: 1 tick per 5 points)
        tickValue = Math.max(
          1,
          Math.floor(sourceActor.system.attributes[attributeTick].current / 5)
        );
      }
    }

    // Get weapon/item damage
    const weaponDamage = sourceItem?.system?.damage?.value || 0;

    // Calculate base damage using DASU formula: Weapon Damage + Governing Attribute Tick (if applicable)
    let baseDamage = weaponDamage + tickValue;

    // Apply additional modifiers
    baseDamage += modifiers.bonus || 0;
    baseDamage *= modifiers.multiplier || 1;

    const finalBaseDamage = Math.max(0, Math.floor(baseDamage));

    if (isNaN(finalBaseDamage)) {
      return 0;
    }

    return finalBaseDamage;
  }

  /**
   * Apply DASU resistance rules to damage
   * @param {number} baseDamage - Base damage before resistance
   * @param {Actor} targetActor - The target actor
   * @param {string} damageType - Type of damage (physical, fire, ice, etc.)
   * @param {boolean} [isCritical=false] - Whether this is a critical hit
   * @returns {Object} Resistance result with final damage and metadata
   */
  static applyResistance(
    baseDamage,
    targetActor,
    damageType,
    isCritical = false
  ) {
    // Get target's resistance value for this damage type
    const resistance = targetActor.system.resistances?.[damageType];
    if (!resistance) {
      // No resistance data found, treat as normal (0)
      return {
        damage: baseDamage,
        isHealing: false,
        value: 0,
        type: 'normal',
        multiplier: 1,
      };
    }

    const resistanceValue = resistance.current;

    // Apply DASU resistance rules
    return this._applyResistanceRules(baseDamage, resistanceValue, isCritical);
  }

  /**
   * Apply DASU resistance rules based on resistance value
   * @param {number} baseDamage - Base damage amount
   * @param {number} resistanceValue - Resistance value (-1 to 3)
   * @param {boolean} [isCritical=false] - Whether this is a critical hit
   * @returns {Object} Resistance calculation result
   * @private
   */
  static _applyResistanceRules(
    baseDamage,
    resistanceValue,
    isCritical = false
  ) {
    switch (resistanceValue) {
      case -1: // Weak
        const weakMultiplier = isCritical ? 4 : 2;
        return {
          damage: baseDamage * weakMultiplier,
          isHealing: false,
          value: resistanceValue,
          type: 'weak',
          multiplier: weakMultiplier,
        };

      case 0: // Normal
        const normalMultiplier = isCritical ? 2 : 1;
        return {
          damage: baseDamage * normalMultiplier,
          isHealing: false,
          value: resistanceValue,
          type: 'normal',
          multiplier: normalMultiplier,
        };

      case 1: // Resist
        const resistMultiplier = isCritical ? 1 : 0.5;
        return {
          damage: Math.floor(baseDamage * resistMultiplier),
          isHealing: false,
          value: resistanceValue,
          type: 'resist',
          multiplier: resistMultiplier,
        };

      case 2: // Nullify
        return {
          damage: 0,
          isHealing: false,
          value: resistanceValue,
          type: 'nullify',
          multiplier: 0,
        };

      case 3: // Drain
        const drainMultiplier = isCritical ? -2 : -1;
        return {
          damage: Math.floor(baseDamage * Math.abs(drainMultiplier)),
          isHealing: true,
          value: resistanceValue,
          type: 'drain',
          multiplier: drainMultiplier,
        };

      default:
        // Fallback to normal resistance
        return {
          damage: baseDamage,
          isHealing: false,
          value: 0,
          type: 'normal',
          multiplier: 1,
        };
    }
  }

  /**
   * Get human-readable resistance type name
   * @param {number} resistanceValue - Resistance value (-1 to 3)
   * @returns {string} Localization key for resistance type
   */
  static getResistanceTypeName(resistanceValue) {
    switch (resistanceValue) {
      case -1:
        return 'DASU.RESISTANCE.Weak';
      case 0:
        return 'DASU.RESISTANCE.Normal';
      case 1:
        return 'DASU.RESISTANCE.Resist';
      case 2:
        return 'DASU.RESISTANCE.Nullify';
      case 3:
        return 'DASU.RESISTANCE.Drain';
      default:
        return 'DASU.RESISTANCE.Normal';
    }
  }

  /**
   * Get CSS class for resistance type styling
   * @param {number} resistanceValue - Resistance value (-1 to 3)
   * @returns {string} CSS class name
   */
  static getResistanceTypeClass(resistanceValue) {
    switch (resistanceValue) {
      case -1:
        return 'resistance-weak';
      case 0:
        return 'resistance-normal';
      case 1:
        return 'resistance-resist';
      case 2:
        return 'resistance-nullify';
      case 3:
        return 'resistance-drain';
      default:
        return 'resistance-normal';
    }
  }

  /**
   * Validate damage data for calculation
   * @param {Actor} sourceActor - Source actor
   * @param {Item} [sourceItem] - Source item
   * @param {Actor} targetActor - Target actor
   * @param {string} damageType - Damage type
   * @throws {Error} If validation fails
   */
  static validateDamageData(sourceActor, sourceItem, targetActor, damageType) {
    if (!sourceActor) {
      throw new Error('Source actor is required for damage calculation');
    }

    if (!targetActor) {
      throw new Error('Target actor is required for damage calculation');
    }

    if (!damageType) {
      throw new Error('Damage type is required for damage calculation');
    }

    // Validate damage type exists in system
    const validDamageTypes = [
      'physical',
      'fire',
      'ice',
      'electric',
      'wind',
      'earth',
      'light',
      'dark',
    ];

    if (!validDamageTypes.includes(damageType)) {
      throw new Error(`Invalid damage type: ${damageType}`);
    }

    // Validate source actor has required attributes
    if (!sourceActor.system?.attributes?.pow) {
      throw new Error(
        'Source actor missing POW attribute for damage calculation'
      );
    }

    // Validate target actor has resistance data (silently treat as normal if missing)
  }

  /**
   * Calculate damage preview for multiple targets
   * @param {Actor} sourceActor - Source actor
   * @param {Item} [sourceItem] - Source item
   * @param {Array} targets - Array of target actors
   * @param {string} damageType - Damage type
   * @param {Object} [modifiers={}] - Damage modifiers
   * @returns {Array} Array of damage preview results
   */
  static calculateDamagePreview(
    sourceActor,
    sourceItem,
    targets,
    damageType,
    modifiers = {}
  ) {
    const baseDamage = this.calculateBaseDamage(
      sourceActor,
      sourceItem,
      modifiers
    );

    return targets.map((target) => {
      const resistanceResult = this.applyResistance(
        baseDamage,
        target,
        damageType,
        modifiers.isCritical
      );

      return {
        targetId: target.id,
        targetName: target.name,
        baseDamage: baseDamage,
        finalDamage: resistanceResult.damage,
        resistance: resistanceResult,
        isHealing: resistanceResult.isHealing,
      };
    });
  }
}
