/**
 * Processing Phase Implementation
 * Handles dice rolling and result calculation
 */

import { DicePoolSystem } from '../systems/dice-pool.mjs';
import { D6System } from '../systems/d6-system.mjs';
import { createCheckResult, DiceSystems, CheckTypes } from '../core/types.mjs';

export class ProcessPhase {
  static async process(check, actor, item) {
    const result = createCheckResult(check, {
      actorUuid: actor.uuid,
      itemUuid: item?.uuid || null,
    });

    // Calculate modifier total
    result.modifierTotal = check.modifiers.reduce(
      (sum, mod) => sum + mod.value,
      0
    );

    // System-specific processing
    switch (check.diceSystem) {
      case DiceSystems.POOL:
        await DicePoolSystem.process(check, result, actor);
        break;
      case DiceSystems.D6:
        await D6System.process(check, result, actor, item);
        break;
      case DiceSystems.DISPLAY:
        // Display checks don't process rolls, but might have one passed in
        if (check.additionalData?.roll) {
          result.roll = check.additionalData.roll;
          result.finalResult = result.roll.total || 0;
        } else {
          result.finalResult = 0;
        }
        break;
      default:
        throw new Error(`Unknown dice system: ${check.diceSystem}`);
    }

    return result;
  }
}
