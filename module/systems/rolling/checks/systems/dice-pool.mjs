/**
 * Dice Pool System Implementation
 * Handles attribute and skill checks using success-based counting
 */

export class DicePoolSystem {
  static async prepare(check, data) {
    const { actor, attributes, skill } = data;
    check.primary = attributes.primary;
    check.secondary = attributes.secondary;

    let primaryDice, secondaryDice;

    if (check.type === 'skill' && skill) {
      primaryDice = skill.ticks || 0;
      secondaryDice = actor.system.attributes[check.primary]?.tick || 1;
      check.additionalData.skill = {
        id: skill.id,
        name: skill.name,
        ticks: skill.ticks,
      };
    } else {
      primaryDice = actor.system.attributes[check.primary]?.tick || 1;
      secondaryDice = check.secondary
        ? actor.system.attributes[check.secondary]?.tick || 1
        : 0;
    }

    check.additionalData.primaryDice = primaryDice;
    check.additionalData.secondaryDice = secondaryDice;
    check.additionalData.baseDice = primaryDice + secondaryDice;
  }

  static async process(check, result, actor) {
    // Calculate total dice including modifiers
    const totalDice = Math.max(
      1,
      check.additionalData.baseDice + result.modifierTotal
    );

    // Create and evaluate roll
    const roll = new Roll(`${totalDice}d6`);
    await roll.evaluate();

    result.roll = roll;

    // Count successes and check for criticals
    let successes = 0;
    let rollResults = [];
    const critThreshold = actor.system.stats?.crit?.value ?? 7;
    let hasCrit = false;

    // Process dice results
    for (const die of roll.dice) {
      for (const dieResult of die.results) {
        const value = dieResult.result;
        rollResults.push(value);

        // Count successes (4-6)
        if (value >= 4 && value <= 6) {
          successes++;
        }
      }
    }

    // Check for critical hits
    if (rollResults.length >= 2) {
      const diceAtOrAboveThreshold = rollResults.filter(
        (r) => r >= critThreshold
      );
      const valueCounts = {};

      for (const die of diceAtOrAboveThreshold) {
        valueCounts[die] = (valueCounts[die] || 0) + 1;
        if (valueCounts[die] >= 2) {
          hasCrit = true;
          break;
        }
      }
    }

    // Store results
    if (check.type === 'skill' && check.additionalData.skill) {
      // For skill checks: primary = skill, secondary = governing attribute
      result.primary = {
        attribute: check.additionalData.skill.name,
        dice: check.additionalData.primaryDice,
        result: check.additionalData.primaryDice,
      };
      result.secondary = {
        attribute: check.primary,
        dice: check.additionalData.secondaryDice,
        result: check.additionalData.secondaryDice,
      };
    } else {
      // For attribute checks
      result.primary = {
        attribute: check.primary,
        dice: check.additionalData.primaryDice,
        result: check.additionalData.primaryDice,
      };

      if (check.secondary) {
        result.secondary = {
          attribute: check.secondary,
          dice: check.additionalData.secondaryDice,
          result: check.additionalData.secondaryDice,
        };
      }
    }

    result.finalResult = successes;
    result.critical = hasCrit;
    result.additionalData.rollResults = rollResults;
    result.additionalData.totalDice = totalDice;
    result.additionalData.critThreshold = critThreshold;
  }
}
