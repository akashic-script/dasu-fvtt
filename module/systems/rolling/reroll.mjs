import { contextMenu } from './context-menu.mjs';
import {
  CheckTypes,
  AdvantageStates,
  DiceSystems,
} from './checks/core/types.mjs';
import { D6System } from './checks/systems/d6-system.mjs';
import { DicePoolSystem } from './checks/systems/dice-pool.mjs';

/**
 * Show reroll dialog for checks
 * @param {Object} context - The context menu context
 */
async function showRerollDialog(context) {
  try {
    const { checkResult, sourceActor } = context;

    if (!checkResult || !sourceActor) {
      ui.notifications.error('Could not find required check information');
      return;
    }

    // Determine which dialog to show based on dice system
    if (checkResult.diceSystem === DiceSystems.D6) {
      await showD6RerollDialog(context);
    } else if (checkResult.diceSystem === DiceSystems.POOL) {
      await showPoolRerollDialog(context);
    } else {
      ui.notifications.warn('Cannot reroll this check type');
    }
  } catch (error) {
    console.error('Reroll dialog error:', error);
    ui.notifications.error('Failed to show reroll dialog');
  }
}

/**
 * Show reroll dialog for D6 checks (accuracy and initiative)
 * @param {Object} context - The context menu context
 */
async function showD6RerollDialog(context) {
  const { message, checkResult, sourceActor, item } = context;

  try {
    // Extract current roll data
    const currentMod = checkResult.additionalData.totalBonus || 0;
    const currentAdvantage =
      checkResult.advantageState || AdvantageStates.NORMAL;
    const hasAdvantageOrDisadvantage =
      currentAdvantage !== AdvantageStates.NORMAL;

    // Use diceWithStatus if available (for advantage/disadvantage), otherwise use rollResults
    const diceWithStatus = checkResult.additionalData.diceWithStatus;
    const rollResults = diceWithStatus
      ? diceWithStatus.map((d) => d.value)
      : checkResult.additionalData.rollResults || [];

    // Prepare context for template
    const templateContext = {
      rollResults,
      currentMod,
      currentAdvantage,
      hasRollResults: rollResults.length > 0,
      hasDie1: rollResults.length >= 1,
      hasDie2: rollResults.length >= 2,
      hasDie3: rollResults.length >= 3,
      hasAdvantageOrDisadvantage,
      advantageStates: {
        normal: AdvantageStates.NORMAL,
        advantage: AdvantageStates.ADVANTAGE,
        disadvantage: AdvantageStates.DISADVANTAGE,
      },
      isNormal: currentAdvantage === AdvantageStates.NORMAL,
      isAdvantage: currentAdvantage === AdvantageStates.ADVANTAGE,
      isDisadvantage: currentAdvantage === AdvantageStates.DISADVANTAGE,
    };

    // Render the content
    const content = await foundry.applications.handlebars.renderTemplate(
      'systems/dasu/templates/dialogs/reroll-dialog.hbs',
      templateContext
    );

    // Create the dialog options
    const dialogOptions = {
      window: {
        title: game.i18n.localize('DASU.Reroll.Dialog.Title'),
        classes: ['dasu', 'reroll-dialog'],
        icon: 'fas fa-dice',
      },
      position: { width: 400 },
      content,
      buttons: [
        {
          action: 'cancel',
          icon: 'fas fa-times',
          label: game.i18n.localize('DASU.Cancel'),
          callback: () => ({ action: 'cancel' }),
        },
        {
          action: 'reroll',
          icon: 'fas fa-dice',
          label: game.i18n.localize('DASU.Reroll.Dialog.Reroll'),
          default: true,
          callback: (_, __, dialog) => {
            const form = dialog.element.querySelector('form');
            if (form) {
              const formData = new foundry.applications.ux.FormDataExtended(
                form
              );
              return { action: 'reroll', formData: formData.object };
            }
            return { action: 'cancel' };
          },
        },
      ],
      render: (_, dialog) => {
        // Get all die elements in the top display
        const diceContainer = dialog.element.querySelector('.dice-container');
        const diceElements = diceContainer
          ? Array.from(diceContainer.querySelectorAll('.die'))
          : [];

        // Show/hide modifier input based on checkbox
        const rerollModCheckbox = dialog.element.querySelector(
          '[name="reroll-mod"]'
        );
        const modifierGroup = dialog.element.querySelector('.modifier-group');

        if (rerollModCheckbox && modifierGroup) {
          rerollModCheckbox.addEventListener('change', (e) => {
            modifierGroup.style.display = e.target.checked ? 'block' : 'none';
          });
        }

        // Handle "reroll all" checkbox
        const rerollAllCheckbox = dialog.element.querySelector(
          '[name="reroll-all"]'
        );
        const die1Checkbox = dialog.element.querySelector(
          '[name="reroll-die1"]'
        );
        const die2Checkbox = dialog.element.querySelector(
          '[name="reroll-die2"]'
        );
        const die3Checkbox = dialog.element.querySelector(
          '[name="reroll-die3"]'
        );

        if (rerollAllCheckbox) {
          rerollAllCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
              if (die1Checkbox) {
                die1Checkbox.checked = false;
                die1Checkbox.disabled = true;
              }
              if (die2Checkbox) {
                die2Checkbox.checked = false;
                die2Checkbox.disabled = true;
              }
              if (die3Checkbox) {
                die3Checkbox.checked = false;
                die3Checkbox.disabled = true;
              }
              // Highlight all dice
              diceElements.forEach((die) => die.classList.add('selected'));
            } else {
              if (die1Checkbox) die1Checkbox.disabled = false;
              if (die2Checkbox) die2Checkbox.disabled = false;
              if (die3Checkbox) die3Checkbox.disabled = false;
              // Remove highlight from all dice
              diceElements.forEach((die) => die.classList.remove('selected'));
            }
          });
        }

        // Handle individual die checkboxes
        if (die1Checkbox && diceElements[0]) {
          die1Checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
              diceElements[0].classList.add('selected');
            } else {
              diceElements[0].classList.remove('selected');
            }
          });
        }

        if (die2Checkbox && diceElements[1]) {
          die2Checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
              diceElements[1].classList.add('selected');
            } else {
              diceElements[1].classList.remove('selected');
            }
          });
        }

        if (die3Checkbox && diceElements[2]) {
          die3Checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
              diceElements[2].classList.add('selected');
            } else {
              diceElements[2].classList.remove('selected');
            }
          });
        }
      },
    };

    const result = await foundry.applications.api.DialogV2.wait(dialogOptions);

    if (result?.action === 'reroll') {
      const formData = result.formData;
      await performReroll(message, checkResult, sourceActor, item, {
        rerollDie1: formData['reroll-die1'] || false,
        rerollDie2: formData['reroll-die2'] || false,
        rerollDie3: formData['reroll-die3'] || false,
        rerollAll: formData['reroll-all'] || false,
        rerollMod: formData['reroll-mod'] || false,
        newModifier: parseInt(formData['new-modifier']) || currentMod,
        advantageState:
          formData['advantage-state'] !== undefined
            ? formData['advantage-state']
            : currentAdvantage,
      });
    }
  } catch (error) {
    console.error('D6 reroll dialog error:', error);
    ui.notifications.error('Failed to show reroll dialog');
  }
}

/**
 * Show reroll dialog for Pool checks (attribute and skill)
 * @param {Object} context - The context menu context
 */
async function showPoolRerollDialog(context) {
  const { message, checkResult, sourceActor, item } = context;

  try {
    const rollResults = checkResult.additionalData.rollResults || [];
    const totalDice =
      checkResult.additionalData.totalDice || rollResults.length;
    const critThreshold = checkResult.additionalData.critThreshold || 7;

    const templateContext = {
      rollResults,
      totalDice,
      critThreshold,
      successCount: checkResult.finalResult || 0,
      isCritical: checkResult.critical || false,
      hasRollResults: rollResults.length > 0,
    };

    // Render the content
    const content = await foundry.applications.handlebars.renderTemplate(
      'systems/dasu/templates/dialogs/reroll-pool-dialog.hbs',
      templateContext
    );

    // Create the dialog options
    const dialogOptions = {
      window: {
        title: game.i18n.localize('DASU.Reroll.Dialog.Title'),
        classes: ['dasu', 'reroll-dialog', 'pool-reroll'],
        icon: 'fas fa-dice',
      },
      position: { width: 400 },
      content,
      buttons: [
        {
          action: 'cancel',
          icon: 'fas fa-times',
          label: game.i18n.localize('DASU.Cancel'),
          callback: () => ({ action: 'cancel' }),
        },
        {
          action: 'reroll',
          icon: 'fas fa-dice',
          label: game.i18n.localize('DASU.Reroll.Dialog.RerollAll'),
          default: true,
          callback: () => ({ action: 'reroll' }),
        },
      ],
      close: () => null,
    };

    const result = await foundry.applications.api.DialogV2.wait(dialogOptions);

    if (result?.action === 'reroll') {
      await performPoolReroll(message, checkResult, sourceActor, item);
    }
  } catch (error) {
    console.error('Pool reroll dialog error:', error);
    ui.notifications.error('Failed to show reroll dialog');
  }
}

/**
 * Perform pool reroll (rerolls all dice in the pool)
 * @param {ChatMessage} message - Original chat message
 * @param {Object} originalResult - Original check result
 * @param {Actor} sourceActor - The actor who made the check
 * @param {Item} item - The item used (if any)
 */
async function performPoolReroll(message, originalResult, sourceActor, item) {
  try {
    const totalDice = originalResult.additionalData.totalDice;
    const critThreshold = originalResult.additionalData.critThreshold || 7;
    const roll = new Roll(`${totalDice}d6`);
    await roll.evaluate();
    let successes = 0;
    let rollResults = [];
    let hasCrit = false;
    for (const die of roll.dice) {
      for (const dieResult of die.results) {
        const value = dieResult.result;
        rollResults.push(value);
        if (value >= 4 && value <= 6) {
          successes++;
        }
      }
    }
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
    const updatedCheckResult = {
      ...foundry.utils.deepClone(originalResult),
      roll,
      finalResult: successes,
      critical: hasCrit,
      additionalData: {
        ...foundry.utils.deepClone(originalResult.additionalData),
        rollResults,
      },
    };
    await createNewChatMessage(message, sourceActor, item, updatedCheckResult);
  } catch (error) {
    console.error('Pool reroll failed:', error);
    ui.notifications.error('Failed to perform reroll');
  }
}

/**
 * Perform the actual reroll with the selected options
 * @param {ChatMessage} message - Original chat message
 * @param {Object} checkResult - Original check result
 * @param {Actor} sourceActor - The actor who made the check
 * @param {Item} item - The item used (if any)
 * @param {Object} options - Reroll options from the dialog
 */
async function performReroll(message, checkResult, sourceActor, item, options) {
  try {
    const {
      rerollDie1,
      rerollDie2,
      rerollDie3,
      rerollAll,
      rerollMod,
      newModifier,
      advantageState,
    } = options;

    // Get the current roll results
    const rollResults = checkResult.additionalData.rollResults || [];
    const currentMod = checkResult.additionalData.totalBonus || 0;
    const advantageChanged = advantageState !== checkResult.advantageState;

    // Check if any action is being taken
    const anyRerollSelected =
      rerollDie1 ||
      rerollDie2 ||
      rerollDie3 ||
      rerollAll ||
      rerollMod ||
      advantageChanged;

    if (!anyRerollSelected) {
      ui.notifications.warn('No reroll options selected');
      return;
    }

    // Determine what we're rerolling
    let newDie1 = rollResults[0] || 0;
    let newDie2 = rollResults[1] || 0;
    let newDie3 = rollResults[2] || 0;
    const finalModifier = rerollMod ? newModifier : currentMod;

    // If advantage state changed or rerolling all, do a full reroll
    if (advantageChanged || rerollAll) {
      const baseRoll = D6System._getBaseRollFormula(advantageState);
      const formula = `${baseRoll} + ${finalModifier}`;
      const roll = new Roll(formula);
      await roll.evaluate();

      // Extract new results
      const newRollResults = D6System._extractRollResults(roll);
      newDie1 = newRollResults[0] || 0;
      newDie2 = newRollResults[1] || 0;

      // Create updated check result
      const updatedCheckResult = await buildUpdatedCheckResult(
        checkResult,
        sourceActor,
        item,
        roll,
        advantageState,
        finalModifier
      );

      await createNewChatMessage(
        message,
        sourceActor,
        item,
        updatedCheckResult
      );
      return;
    }

    // Reroll individual dice
    if (rerollDie1) {
      const dieRoll = new Roll('1d6');
      await dieRoll.evaluate();
      newDie1 = dieRoll.total;
    }

    if (rerollDie2) {
      const dieRoll = new Roll('1d6');
      await dieRoll.evaluate();
      newDie2 = dieRoll.total;
    }

    if (rerollDie3) {
      const dieRoll = new Roll('1d6');
      await dieRoll.evaluate();
      newDie3 = dieRoll.total;
    }

    // Construct a new roll with the updated dice
    const hasDie3 = rollResults.length >= 3;
    const numDice = hasDie3 ? 3 : 2;
    const manualRoll = Roll.create(`${numDice}d6 + ${finalModifier}`);
    await manualRoll.evaluate();

    // Override the dice results with our rerolled values
    for (const term of manualRoll.terms) {
      if (term instanceof foundry.dice.terms.Die) {
        term.results = [
          { result: newDie1, active: true },
          { result: newDie2, active: true },
          ...(hasDie3 ? [{ result: newDie3, active: true }] : []),
        ];
        term._total = hasDie3 ? newDie1 + newDie2 + newDie3 : newDie1 + newDie2;
      }
    }
    manualRoll._total = hasDie3
      ? newDie1 + newDie2 + newDie3 + finalModifier
      : newDie1 + newDie2 + finalModifier;

    // Create updated check result
    const updatedCheckResult = await buildUpdatedCheckResult(
      checkResult,
      sourceActor,
      item,
      manualRoll,
      advantageState,
      finalModifier
    );

    await createNewChatMessage(message, sourceActor, item, updatedCheckResult);
  } catch (error) {
    console.error('Reroll failed:', error);
    ui.notifications.error('Failed to perform reroll');
  }
}

/**
 * Build an updated check result with new roll data
 * @param {Object} originalResult - The original check result
 * @param {Actor} actor - The actor
 * @param {Item} item - The item (if any)
 * @param {Roll} newRoll - The new roll
 * @param {string} advantageState - The advantage state
 * @param {number} modifier - The total modifier
 * @returns {Promise<Object>} Updated check result
 */
async function buildUpdatedCheckResult(
  originalResult,
  actor,
  item,
  newRoll,
  advantageState,
  modifier
) {
  const rollResults = D6System._extractRollResults(newRoll);
  const critThreshold = actor.system.stats?.crit?.value ?? 7;
  const critical = D6System._checkForCritical(
    rollResults,
    critThreshold,
    advantageState
  );

  const diceWithStatus =
    advantageState !== AdvantageStates.NORMAL
      ? D6System._extractDiceWithStatus(newRoll)
      : null;

  // Recalculate targeted individuals if they exist
  let targetedIndividuals = originalResult.targetedIndividuals;
  if (targetedIndividuals && targetedIndividuals.length > 0) {
    const rollTotal = newRoll.total;
    const isFumble = rollTotal <= 2;
    const isAutoSuccess =
      originalResult.autoSuccess || item?.system?.isInfinity;

    targetedIndividuals = targetedIndividuals.map((target) => {
      // Fetch the target actor to get their current avoid value
      const targetActor = game.actors.get(target.actorId);
      if (!targetActor) return target;

      const newResult = calculateTargetResult(
        rollTotal,
        targetActor,
        critical,
        isFumble,
        isAutoSuccess
      );

      return {
        ...target,
        result: newResult,
      };
    });
  }

  return {
    ...foundry.utils.deepClone(originalResult),
    roll: newRoll,
    diceResult: D6System._extractDiceResult(newRoll),
    advantageState,
    finalResult: newRoll.total,
    critical,
    targetedIndividuals,
    additionalData: {
      ...foundry.utils.deepClone(originalResult.additionalData),
      rollResults,
      critThreshold,
      totalBonus: modifier,
      diceWithStatus,
    },
  };
}

/**
 * Calculate hit/miss result for a target (from targeted-processing.mjs)
 */
function calculateTargetResult(
  rollTotal,
  targetActor,
  isCritical,
  isFumble,
  isAutoSuccess
) {
  // Auto-success items always hit, but still check for critical separately
  if (isAutoSuccess) {
    return isCritical ? 'crit' : 'hit';
  }

  if (isFumble) return 'fumble';
  if (isCritical) return 'crit';

  const targetAvoid = targetActor.system?.stats?.avoid?.value || 10;
  return rollTotal >= targetAvoid ? 'hit' : 'miss';
}

/**
 * Create a new chat message with the updated check result
 * @param {ChatMessage} originalMessage - Original message
 * @param {Actor} actor - The actor
 * @param {Item} item - The item (if any)
 * @param {Object} updatedCheckResult - Updated check result
 */
async function createNewChatMessage(
  originalMessage,
  actor,
  item,
  updatedCheckResult
) {
  // Re-render the check using the hooks system
  const sections = [];
  Hooks.call('dasu.renderCheck', sections, updatedCheckResult, actor, item);

  let content = '';
  const sortedSections = sections.sort(
    (a, b) => (a.order || 0) - (b.order || 0)
  );

  for (const section of sortedSections) {
    if (section.partial) {
      content += await foundry.applications.handlebars.renderTemplate(
        section.partial,
        section.data
      );
    }
  }

  const newChatData = {
    author: originalMessage.author,
    speaker: originalMessage.speaker,
    content,
    style: originalMessage.style,
    flags: {
      ...foundry.utils.deepClone(originalMessage.flags),
      dasu: {
        ...foundry.utils.deepClone(originalMessage.flags.dasu),
        checkResult: updatedCheckResult,
      },
    },
  };

  await ChatMessage.create(newChatData);

  ui.notifications.info('Check rerolled successfully');
}

/**
 * Initialize the reroll module
 */
function initialize() {
  contextMenu.registerOption('reroll', {
    name: 'DASU.ContextMenu.Reroll',
    icon: '<i class="fas fa-dice"></i>',
    condition: (context) => {
      if (!context.hasCheckResult) return false;
      const type = context.checkResult.type;
      return (
        type === CheckTypes.ACCURACY ||
        type === CheckTypes.INITIATIVE ||
        type === CheckTypes.ATTRIBUTE ||
        type === CheckTypes.SKILL
      );
    },
    callback: showRerollDialog,
    order: 20,
  });
}

export const Reroll = Object.freeze({
  initialize,
  showRerollDialog,
});
