/**
 * Data validation utilities for Checks system
 */

import {
  CheckTypes,
  DiceSystems,
  AdvantageStates,
  Attributes,
} from './types.mjs';

/**
 * Validate a Check object
 */
export function validateCheck(check) {
  if (!check) {
    throw new Error('Check object is required');
  }

  if (!Object.values(CheckTypes).includes(check.type)) {
    throw new Error(`Invalid check type: ${check.type}`);
  }

  if (!Object.values(DiceSystems).includes(check.diceSystem)) {
    throw new Error(`Invalid dice system: ${check.diceSystem}`);
  }

  if (!check.id || typeof check.id !== 'string') {
    throw new Error('Check must have a valid ID');
  }

  if (!Array.isArray(check.modifiers)) {
    throw new Error('Check modifiers must be an array');
  }

  // Validate modifiers
  for (const modifier of check.modifiers) {
    if (!modifier.label || typeof modifier.label !== 'string') {
      throw new Error('Each modifier must have a label');
    }
    if (typeof modifier.value !== 'number') {
      throw new Error('Each modifier must have a numeric value');
    }
  }

  // Type-specific validation
  if (check.diceSystem === DiceSystems.POOL) {
    if (check.primary && !Object.values(Attributes).includes(check.primary)) {
      throw new Error(`Invalid primary attribute: ${check.primary}`);
    }
    if (
      check.secondary &&
      !Object.values(Attributes).includes(check.secondary)
    ) {
      throw new Error(`Invalid secondary attribute: ${check.secondary}`);
    }
  }

  if (check.diceSystem === DiceSystems.D6) {
    if (
      check.advantageState &&
      !Object.values(AdvantageStates).includes(check.advantageState)
    ) {
      throw new Error(`Invalid advantage state: ${check.advantageState}`);
    }
  }

  return true;
}

/**
 * Validate a CheckResult object
 */
export function validateCheckResult(result) {
  if (!result) {
    throw new Error('CheckResult object is required');
  }

  if (!Object.values(CheckTypes).includes(result.type)) {
    throw new Error(`Invalid result type: ${result.type}`);
  }

  if (!Object.values(DiceSystems).includes(result.diceSystem)) {
    throw new Error(`Invalid dice system: ${result.diceSystem}`);
  }

  if (!result.id || typeof result.id !== 'string') {
    throw new Error('CheckResult must have a valid ID');
  }

  if (!result.actorUuid || typeof result.actorUuid !== 'string') {
    throw new Error('CheckResult must have a valid actor UUID');
  }

  // Display checks don't require a Roll object, but other systems do
  if (
    result.diceSystem !== DiceSystems.DISPLAY &&
    (!result.roll || !(result.roll instanceof Roll))
  ) {
    throw new Error('CheckResult must have a valid Roll object');
  }

  // If display check has a roll, it must be valid
  if (
    result.diceSystem === DiceSystems.DISPLAY &&
    result.roll &&
    !(result.roll instanceof Roll)
  ) {
    throw new Error(
      'Display CheckResult roll must be a valid Roll object if present'
    );
  }

  if (typeof result.finalResult !== 'number') {
    throw new Error('CheckResult must have a numeric final result');
  }

  if (typeof result.critical !== 'boolean') {
    throw new Error('CheckResult critical flag must be boolean');
  }

  if (typeof result.fumble !== 'boolean') {
    throw new Error('CheckResult fumble flag must be boolean');
  }

  return true;
}
