/**
 * Type definitions and constants for the DASU Checks system
 * Provides TypeScript-style type checking, validation, and factory functions
 */

/**
 * Available check types in the DASU system
 * @readonly
 * @enum {string}
 */
export const CheckTypes = {
  /** Attribute checks using dice pool system */
  ATTRIBUTE: 'attribute',
  /** Skill checks using dice pool system */
  SKILL: 'skill',
  /** Accuracy/weapon checks using 2d6 system */
  ACCURACY: 'accuracy',
  /** Initiative checks using 2d6 system */
  INITIATIVE: 'initiative',
  /** Display checks for items without rolls */
  DISPLAY: 'display',
};

/**
 * Available dice systems for different check types
 * @readonly
 * @enum {string}
 */
export const DiceSystems = {
  /** Dice pool system for attribute/skill checks */
  POOL: 'pool',
  /** 2d6 system for accuracy/initiative checks */
  D6: '2d6',
  /** Display system for non-rolling checks */
  DISPLAY: 'display',
};

/**
 * Advantage states for 2d6 checks
 * @readonly
 * @enum {string}
 */
export const AdvantageStates = {
  /** Normal roll */
  NORMAL: 'normal',
  /** Roll with advantage */
  ADVANTAGE: 'advantage',
  /** Roll with disadvantage */
  DISADVANTAGE: 'disadvantage',
};

/**
 * Available attributes in the DASU system
 * @readonly
 * @enum {string}
 */
export const Attributes = {
  /** Power attribute */
  POW: 'pow',
  /** Dexterity attribute */
  DEX: 'dex',
  /** Will attribute */
  WILL: 'will',
  /** Stamina attribute */
  STA: 'sta',
};

/**
 * Create a new Check object with default values
 * @param {string} type - The check type from CheckTypes enum
 * @param {Object} [overrides={}] - Properties to override defaults
 * @returns {Object} A new check object with appropriate dice system
 * @example
 * const check = createCheck(CheckTypes.ATTRIBUTE, { primary: 'pow', secondary: 'dex' });
 */
export function createCheck(type, overrides = {}) {
  return {
    type,
    id: foundry.utils.randomID(),
    diceSystem:
      type === CheckTypes.ATTRIBUTE || type === CheckTypes.SKILL
        ? DiceSystems.POOL
        : type === CheckTypes.DISPLAY
        ? DiceSystems.DISPLAY
        : DiceSystems.D6,
    modifiers: [],
    additionalData: {},
    ...overrides,
  };
}

/**
 * Create a new CheckResult object with default values
 * @param {Object} check - The check object to base the result on
 * @param {Object} [overrides={}] - Properties to override defaults
 * @returns {Object} A new check result object
 * @example
 * const result = createCheckResult(check, { actorUuid: actor.uuid, roll: myRoll });
 */
export function createCheckResult(check, overrides = {}) {
  return {
    type: check.type,
    id: check.id,
    diceSystem: check.diceSystem,
    actorUuid: '',
    itemUuid: null,
    roll: null,
    additionalRolls: [],
    modifiers: check.modifiers,
    modifierTotal: 0,
    finalResult: 0,
    fumble: false,
    critical: false,
    additionalData: check.additionalData,
    ...overrides,
  };
}
