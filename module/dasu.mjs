// Import document classes.
import { DASUActor } from './documents/actor.mjs';
import { DASUItem } from './documents/item.mjs';
// Import sheet classes.
import { DASUActorSheet } from './sheets/actor-sheet.mjs';
import { DASUItemSheet } from './sheets/item-sheet.mjs';
// Import DataModel classes
import * as models from './data/_module.mjs';
// Import config
import DASUConfig from './helpers/config.mjs';
// Import settings
import { DASUSettings } from './settings.mjs';
// Import status conditions
import { registerStatusConditions } from './data/status-conditions.mjs';
import { registerHandlebarsHelpers } from './helpers/helpers.mjs';
// Import roll system
import { DASUAccuracyRollV1 } from './helpers/dasu-accuracy-check.mjs';
import { DASUAttributeCheckV1 } from './helpers/dasu-attribute-check.mjs';
import { DASURollDialog } from './applications/roll-dialog.mjs';

const collections = foundry.documents.collections;
const sheets = foundry.appv1.sheets;

/* -------------------------------------------- */
/*  Init Hook                                   */
/* -------------------------------------------- */

// Add key classes to the global scope so they can be more easily used
// by downstream developers
globalThis.DASU = {
  documents: {
    DASUActor,
    DASUItem,
  },
  applications: {
    DASUActorSheet,
    DASUItemSheet,
    DASURollDialog,
  },
  utils: {
    rollItemMacro,
    DASUAccuracyRollV1,
    DASUAttributeCheckV1,
  },
  settings: DASUSettings,
  models,
  // Include config from config.mjs
  ...DASUConfig,
};

Hooks.once('init', function () {
  // Add custom constants for configuration.
  CONFIG.DASU = globalThis.DASU;

  /**
   * Set an initiative formula for the system
   * @type {String}
   */
  CONFIG.Combat.initiative = {
    formula: '2d6 + @attributes.dex.tick',
    decimals: 2,
  };

  // Hook to handle individual initiative rolls from actor sheets
  // TODO: Replace with a fleshed out initiative mechanic later
  Hooks.on('dasu.rollInitiative', async (actor) => {
    const combat = game.combat;
    if (!combat) {
      ui.notifications.warn('No active combat encounter found.');
      return;
    }

    const combatant = combat.combatants.find((c) => c.actor?.id === actor.id);
    if (!combatant) {
      ui.notifications.warn(
        'This character is not in the current combat encounter.'
      );
      return;
    }

    // Determine which ticks to use for initiative
    let initiativeTicks = 0;
    let tickSource = 'DEX';

    if (actor.type === 'summoner') {
      // For summoners, find the highest skill ticks that could be used for initiative
      const skills = actor.system.skills || [];
      let highestSkillTicks = 0;
      let highestSkillName = '';

      for (const skill of skills) {
        if (skill.ticks > highestSkillTicks) {
          highestSkillTicks = skill.ticks;
          highestSkillName = skill.name;
        }
      }

      // Use the higher of dex ticks or highest skill ticks
      const dexTicks = actor.system.attributes?.dex?.tick || 1;
      if (highestSkillTicks > dexTicks) {
        initiativeTicks = highestSkillTicks;
        tickSource = highestSkillName;
      } else {
        initiativeTicks = dexTicks;
        tickSource = 'DEX';
      }
    } else {
      // For daemons, use dex ticks
      initiativeTicks = actor.system.attributes?.dex?.tick || 1;
      tickSource = 'DEX';
    }

    // Roll initiative using DASU success-based system
    const roll = new Roll(`2d6 + ${initiativeTicks}d6`, actor.getRollData());
    await roll.evaluate();

    let successes = 0;
    let rollResults = [];

    // Count successes (4-6) from the roll results
    if (roll.dice && roll.dice.length > 0) {
      for (const die of roll.dice) {
        if (die.results) {
          for (const result of die.results) {
            rollResults.push(result.result);
            if (result.result >= 4 && result.result <= 6) {
              successes++;
            }
          }
        }
      }
    }

    // Update combatant initiative
    await combatant.update({ initiative: successes });

    // Send chat message with initiative card
    const templateData = {
      tickSource: tickSource,
      initiativeTicks: initiativeTicks,
      diceMod: 0,
      initiativeResult:
        successes + (successes === 1 ? ' success' : ' successes'),
    };

    const content = await renderTemplate(
      'systems/dasu/templates/chat/initiative-card.hbs',
      templateData
    );

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: combatant.actor }),
      content: content,
      roll: roll,
      rollMode: game.settings.get('core', 'rollMode'),
    });
  });

  // Hook to handle skill-based initiative rolls (supports both legacy and new dialog formats)
  Hooks.on(
    'dasu.rollInitiativeWithSkill',
    async (actor, skillNameOrOptions, skillTicks) => {
      const combat = game.combat;
      if (!combat) {
        ui.notifications.warn('No active combat encounter found.');
        return;
      }

      const combatant = combat.combatants.find((c) => c.actor?.id === actor.id);
      if (!combatant) {
        ui.notifications.warn(
          'This character is not in the current combat encounter.'
        );
        return;
      }

      let initiativeTicks = 0;
      let tickSource = '';
      let diceMod = 0;
      let customLabel = 'Initiative Roll';

      // Check if this is the new dialog format (object) or legacy format (string)
      if (typeof skillNameOrOptions === 'object') {
        // New dialog format
        const rollOptions = skillNameOrOptions;

        if (rollOptions.initiativeType === 'dex') {
          initiativeTicks = actor.system.attributes?.dex?.tick || 1;
          tickSource = 'DEX';
        } else if (rollOptions.initiativeType.startsWith('skill:')) {
          const skillName = rollOptions.initiativeType.substring(6); // Remove 'skill:' prefix
          const skills = actor.system.skills || [];
          const skill = skills.find((s) => s.name === skillName);

          if (skill) {
            initiativeTicks = skill.ticks || 0;
            tickSource = skillName;
          } else {
            ui.notifications.error(`Skill "${skillName}" not found.`);
            return;
          }
        }

        diceMod = rollOptions.diceMod || 0;
        customLabel = rollOptions.label || 'Initiative Roll';
      } else {
        // Legacy format
        const skillName = skillNameOrOptions;
        initiativeTicks = skillTicks || 0;
        tickSource = skillName;
      }

      // Roll initiative: 2d6 (sum) + initiative ticks + mod
      const flatMod = initiativeTicks + diceMod;
      const roll = new Roll(`2d6 + ${flatMod}`, actor.getRollData());
      await roll.evaluate();

      const initiativeResult = roll.total;

      // Get dice results for crit detection
      let rollResults = [];
      let critThreshold = actor.system.stats?.crit?.value ?? 7;
      let hasCrit = false;

      for (const term of roll.terms) {
        if (term instanceof foundry.dice.terms.Die) {
          for (const result of term.results) {
            rollResults.push(result.result);
          }
        }
      }

      // Check for crit: any two dice of the same value that are both at or above the crit threshold
      if (rollResults.length >= 2) {
        const diceAtOrAboveThreshold = rollResults.filter(
          (result) => result >= critThreshold
        );
        // Count occurrences of each die value at or above threshold
        const valueCounts = {};
        for (const die of diceAtOrAboveThreshold) {
          valueCounts[die] = (valueCounts[die] || 0) + 1;
          // If we have two or more dice of the same value at/above threshold, it's a crit
          if (valueCounts[die] >= 2) {
            hasCrit = true;
            break;
          }
        }
      }

      // Update combatant initiative
      await combatant.update({ initiative: initiativeResult });

      // Send chat message with initiative card
      const templateData = {
        tickSource: tickSource,
        initiativeTicks: initiativeTicks,
        diceMod: diceMod,
        initiativeResult: initiativeResult,
        rollResults: rollResults,
        hasCrit: hasCrit,
        critThreshold: critThreshold,
      };

      const content = await renderTemplate(
        'systems/dasu/templates/chat/initiative-card.hbs',
        templateData
      );

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: combatant.actor }),
        content: content,
        roll: roll,
        rollMode: game.settings.get('core', 'rollMode'),
      });
    }
  );

  // Register system settings
  DASUSettings.registerSettings();

  // Define custom Document and DataModel classes
  CONFIG.Actor.documentClass = DASUActor;

  // Register Actor data models
  CONFIG.Actor.dataModels = {
    daemon: models.DaemonDataModel,
    summoner: models.SummonerDataModel,
  };

  // Register Item data models
  CONFIG.Item.documentClass = DASUItem;
  CONFIG.Item.dataModels = {
    item: models.ItemDataModel,
    ability: models.AbilityDataModel,
    weapon: models.WeaponDataModel,
    tag: models.TagDataModel,
    tactic: models.TacticDataModel,
    special: models.SpecialDataModel,
    scar: models.ScarDataModel,
    schema: models.SchemaDataModel,
    feature: models.FeatureDataModel,
    class: models.ClassDataModel,
  };

  // Active Effects are never copied to the Actor,
  // but will still apply to the Actor from within the Item
  // if the transfer property on the Active Effect is true.
  CONFIG.ActiveEffect.legacyTransferral = false;

  // Register sheet application classes
  collections.Actors.unregisterSheet('core', sheets.ActorSheet);
  collections.Actors.registerSheet('dasu', DASUActorSheet, {
    types: ['summoner', 'daemon'],
    makeDefault: true,
    label: 'DASU.SheetLabels.Actor',
  });
  collections.Items.unregisterSheet('core', sheets.ItemSheet);
  collections.Items.registerSheet('dasu', DASUItemSheet, {
    makeDefault: true,
    label: 'DASU.SheetLabels.Item',
  });

  // Register custom status conditions
  registerStatusConditions();

  registerHandlebarsHelpers();
});

// Global level change listener for DASU
Hooks.on('preUpdateActor', (actor, updateData, options, userId) => {
  // Only fire if level actually changed
  const newLevel = foundry.utils.getProperty(updateData, 'system.level');

  // If no level change in this update, skip
  if (typeof newLevel !== 'number') {
    return;
  }

  // Get the current level from the actor (before the update)
  const currentLevel = actor.system.level;

  if (newLevel !== currentLevel) {
    // Use setTimeout to ensure this runs after the update is complete
    setTimeout(() => {
      Hooks.callAll(
        'dasu.levelChanged',
        actor,
        { oldLevel: currentLevel, newLevel },
        updateData,
        options,
        userId
      );
    }, 0);
  }
});

/* -------------------------------------------- */
/*  Ready Hook                                  */
/* -------------------------------------------- */

Hooks.once('ready', function () {
  // Wait to register hotbar drop hook on ready so that modules could register earlier if they want to
  Hooks.on('hotbarDrop', (bar, data, slot) => createDocMacro(data, slot));
});

/* -------------------------------------------- */
/*  Hotbar Macros                               */
/* -------------------------------------------- */

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
async function createDocMacro(data, slot) {
  // First, determine if this is a valid owned item.
  if (data.type !== 'Item') return;
  if (!data.uuid.includes('Actor.') && !data.uuid.includes('Token.')) {
    return ui.notifications.warn(
      'You can only create macro buttons for owned Items'
    );
  }
  // If it is, retrieve it based on the uuid.
  const item = await Item.fromDropData(data);

  // Create the macro command using the uuid.
  const command = `game.dasu.rollItemMacro("${data.uuid}");`;
  let macro = game.macros.find(
    (m) => m.name === item.name && m.command === command
  );
  if (!macro) {
    macro = await Macro.create({
      name: item.name,
      type: 'script',
      img: item.img,
      command: command,
      flags: { 'dasu.itemMacro': true },
    });
  }
  game.user.assignHotbarMacro(macro, slot);
  return false;
}

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {string} itemUuid
 */
function rollItemMacro(itemUuid) {
  // Reconstruct the drop data so that we can load the item.
  const dropData = {
    type: 'Item',
    uuid: itemUuid,
  };
  // Load the item from the uuid.
  Item.fromDropData(dropData).then((item) => {
    // Determine if the item loaded and if it's an owned item.
    if (!item || !item.parent) {
      const itemName = item?.name ?? itemUuid;
      return ui.notifications.warn(
        `Could not find item ${itemName}. You may need to delete and recreate this macro.`
      );
    }

    // Trigger the item roll
    item.roll();
  });
}

// --- Tag effect sync for all effect changes ---
async function resyncWeaponsForTagEffect(effect) {
  const parent = effect.parent;
  if (!parent || parent.type !== 'tag') return;
  const actor = parent.actor;
  if (!actor) return;
  const weapons = actor.items.filter((i) => i.type === 'weapon');
  for (const weapon of weapons) {
    const tagSlots = weapon.system.tagSlots || {};
    for (const slot of Object.values(tagSlots)) {
      if (slot.tagId === parent.id) {
        await weapon.resyncTagEffects();
        break;
      }
    }
  }
}

Hooks.on('createActiveEffect', resyncWeaponsForTagEffect);
Hooks.on('deleteActiveEffect', resyncWeaponsForTagEffect);
Hooks.on('updateActiveEffect', async (effect, changes, options, userId) => {
  // Always resync for any update to a tag's effect
  await resyncWeaponsForTagEffect(effect);
});

// --- Re-render actor sheet when a tag is updated ---
Hooks.on('updateItem', async (item, changes, options, userId) => {
  if (item.type !== 'tag' || !item.actor) return;
  const items = item.actor.items;
  let updated = false;
  for (const doc of items) {
    const tagSlots = doc.system?.tagSlots || {};
    const updateData = {};
    for (const [slotKey, slot] of Object.entries(tagSlots)) {
      if (slot.tagId === item.id && slot.tagName !== item.name) {
        updateData[`system.tagSlots.${slotKey}.tagName`] = item.name;
      }
    }
    if (Object.keys(updateData).length > 0) {
      await doc.update(updateData);
      updated = true;
    }
  }
  if (updated && item.actor.sheet) {
    item.actor.sheet.render(false);
  }
});
