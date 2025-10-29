/**
 * 2d6 System Implementation
 * Handles accuracy and initiative checks using total-based results
 */

import { AdvantageStates } from '../core/types.mjs';

export class D6System {
  static async prepare(check, data) {
    const { actor, item, attribute } = data;

    if (check.type === 'accuracy' && item) {
      // Accuracy check setup
      let bonus = this._getItemBonus(item);

      // Add actor bonuses
      if (actor?.system?.stats) {
        if (['weapon', 'ability'].includes(item.type)) {
          bonus += actor.system.stats.toHit?.mod || 0;
        } else if (item.type === 'tactic') {
          bonus += actor.system.stats.toLand?.mod || 0;
        }
      }

      check.flatBonus = bonus;

      // Only set advantage state if not already set (preserve dialog setting)
      if (!check.advantageState) {
        check.advantageState = AdvantageStates.NORMAL;
      }
      check.additionalData.item = {
        id: item.id,
        name: item.name,
        type: item.type,
      };
    } else if (check.type === 'initiative' && attribute) {
      // Initiative check setup
      check.flatBonus = actor.system.attributes[attribute]?.tick || 1;
      // Only set advantage state if not already set
      if (!check.advantageState) {
        check.advantageState = AdvantageStates.NORMAL;
      }
      check.additionalData.attribute = attribute;
    }

    // Set base roll formula
    check.baseRoll = this._getBaseRollFormula(check.advantageState);
  }

  static async process(check, result, actor, item) {
    // Check if item has isInfinity (auto-success for accuracy checks)
    const isInfinityItem = item?.system?.isInfinity;

    if (check.type === 'accuracy' && isInfinityItem) {
      // Auto-success for infinity items - still roll dice but guarantee success
      const totalBonus = check.flatBonus + result.modifierTotal;
      const formula = `${check.baseRoll} + ${totalBonus}`;
      const roll = new Roll(formula);
      await roll.evaluate();

      result.roll = roll;
      result.diceResult = this._extractDiceResult(roll);
      result.flatBonus = check.flatBonus;
      result.advantageState = check.advantageState;
      result.finalResult = 999; // High value to ensure success in targeting
      result.autoSuccess = true; // Flag to indicate this was an auto-success

      // Check for criticals normally from the actual dice roll
      const rollResults = this._extractRollResults(roll);
      const critThreshold = actor.system.stats?.crit?.value ?? 7;
      result.critical = this._checkForCritical(
        rollResults,
        critThreshold,
        check.advantageState
      );

      // Store additional data
      result.additionalData.rollResults = rollResults;
      result.additionalData.critThreshold = critThreshold;
      result.additionalData.totalBonus = totalBonus;
      result.additionalData.isInfinity = true;

      // For advantage/disadvantage rolls, also store dice with status
      if (check.advantageState !== AdvantageStates.NORMAL) {
        result.additionalData.diceWithStatus =
          this._extractDiceWithStatus(roll);
      }

      return;
    }

    // Normal processing for non-infinity items
    // Calculate total bonus
    const totalBonus = check.flatBonus + result.modifierTotal;

    // Create roll formula
    const formula = `${check.baseRoll} + ${totalBonus}`;
    const roll = new Roll(formula);
    await roll.evaluate();

    result.roll = roll;
    result.diceResult = this._extractDiceResult(roll);
    result.flatBonus = check.flatBonus;
    result.advantageState = check.advantageState;
    result.finalResult = roll.total;

    // Check for criticals
    const rollResults = this._extractRollResults(roll);
    const critThreshold = actor.system.stats?.crit?.value ?? 7;
    result.critical = this._checkForCritical(
      rollResults,
      critThreshold,
      check.advantageState
    );

    // Store additional data
    result.additionalData.rollResults = rollResults;
    result.additionalData.critThreshold = critThreshold;
    result.additionalData.totalBonus = totalBonus;

    // For advantage/disadvantage rolls, also store dice with status
    if (check.advantageState !== AdvantageStates.NORMAL) {
      result.additionalData.diceWithStatus = this._extractDiceWithStatus(roll);
    }
  }

  static _getItemBonus(item) {
    switch (item.type) {
      case 'weapon':
      case 'ability':
        return item.system.toHit || 0;
      case 'tactic':
        return item.system.toLand || 0;
      default:
        return 0;
    }
  }

  static _getBaseRollFormula(advantageState) {
    switch (advantageState) {
      case AdvantageStates.ADVANTAGE:
        return '3d6kh2';
      case AdvantageStates.DISADVANTAGE:
        return '3d6kl2';
      default:
        return '2d6';
    }
  }

  static _extractDiceResult(roll) {
    // Extract just the dice portion of the roll
    for (const term of roll.terms) {
      if (term instanceof foundry.dice.terms.Die) {
        return term.total;
      }
    }
    return 0;
  }

  static _extractRollResults(roll) {
    const results = [];
    for (const term of roll.terms) {
      if (term instanceof foundry.dice.terms.Die) {
        for (const result of term.results) {
          if (result.active !== false) {
            results.push(result.result);
          }
        }
      }
    }
    return results;
  }

  static _extractDiceWithStatus(roll) {
    const diceWithStatus = [];
    for (const term of roll.terms) {
      if (term instanceof foundry.dice.terms.Die) {
        for (const result of term.results) {
          diceWithStatus.push({
            value: result.result,
            dropped: result.active === false,
          });
        }
      }
    }
    return diceWithStatus;
  }

  static _checkForCritical(rollResults, critThreshold, advantageState) {
    if (rollResults.length < 2) return false;

    const diceAtOrAboveThreshold = rollResults.filter(
      (r) => r >= critThreshold
    );
    const valueCounts = {};

    for (const die of diceAtOrAboveThreshold) {
      valueCounts[die] = (valueCounts[die] || 0) + 1;
      if (valueCounts[die] >= 2) {
        return true;
      }
    }

    return false;
  }
}
