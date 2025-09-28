/**
 * Preparation Phase Implementation
 * Handles check initialization and modifier collection
 */

import { DicePoolSystem } from '../systems/dice-pool.mjs';
import { D6System } from '../systems/d6-system.mjs';
import { createCheck, CheckTypes } from '../core/types.mjs';

export class PreparePhase {
  static async prepare(type, data, config) {
    const check = createCheck(type);

    // Type-specific preparation
    switch (type) {
      case CheckTypes.ATTRIBUTE:
      case CheckTypes.SKILL:
        await DicePoolSystem.prepare(check, data);
        break;
      case CheckTypes.ACCURACY:
      case CheckTypes.INITIATIVE:
        await D6System.prepare(check, data);
        break;
      case CheckTypes.DISPLAY:
        // Display checks don't need special preparation
        break;
      default:
        throw new Error(`Unknown check type: ${type}`);
    }

    // Apply configuration callback if provided
    if (config && typeof config === 'function') {
      await config(check);
    }

    return check;
  }
}
