// Import document classes.
import { DASUActor } from './core/documents/actor.mjs';
import { DASUItem } from './core/documents/item.mjs';
import { DASUActiveEffect } from './core/documents/active-effect.mjs';
// Import sheet classes.
import { DASUActorSheet } from './core/sheets/actor-sheet.mjs';
import { DASUItemSheet } from './core/sheets/item-sheet.mjs';
import { DASUActiveEffectConfig } from './ui/sheets/active-effect-config.mjs';
// Import DataModel classes
import * as models from './data/shared/_module.mjs';
import { DASUActiveEffectData } from './data/effects/active-effect-data.mjs';
// Import config
import DASUConfig from './utils/config.mjs';
// Import settings
import { DASUSettings } from './core/settings.mjs';
// Import status conditions
import {
  registerStatusConditions,
  DASU_STATUS_CONDITIONS,
} from './data/shared/status-conditions.mjs';
import { registerHandlebarsHelpers } from './utils/helpers.mjs';
// Import roll system
import Checks from './systems/rolling/index.mjs';
import { DASURollDialog } from './ui/dialogs/roll-dialog.mjs';
// Import enrichers
import { initializeHealingEnricher } from './systems/rolling/healing/enricher.mjs';
import { initializeDamageEnricher } from './systems/rolling/damage/enricher.mjs';
import { initializeCostEnricher } from './systems/rolling/cost/enricher.mjs';
// Import effects system
import {
  initializeEffects,
  initializeTokenHudEffects,
  registerEffectEnricher,
} from './systems/effects/index.mjs';
// Import combat tracker enhancements
import { initializeCombatTracker } from './core/combat-tracker.mjs';
// Import system controls
import { SystemControls } from './helpers/system-controls.mjs';

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
    Checks,
  },
  settings: DASUSettings,
  models,
  SystemControls,
  // Include config from config.mjs
  ...DASUConfig,
};

Hooks.once('init', function () {
  // Add custom constants for configuration.
  CONFIG.DASU = globalThis.DASU;

  // Override Combat.prototype.updateCombatantActors to prevent Foundry's default duration system
  // This method updates ALL actor effects on EVERY turn - we use custom per-actor tracking instead
  Combat.prototype.updateCombatantActors = function () {
    // Do nothing - our custom system in the updateCombat hook handles duration tracking
  };

  // Register Checks system
  game.dasu = game.dasu || {};
  game.dasu.checks = Checks;

  // Global roll methods using Checks
  game.dasu.rollAttribute = Checks.attributeCheck;
  game.dasu.rollSkill = Checks.skillCheck;
  game.dasu.rollAccuracy = Checks.accuracyCheck;
  game.dasu.rollInitiative = Checks.initiativeCheck;

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
  CONFIG.ActiveEffect.documentClass = DASUActiveEffect;

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

  // Register Active Effect data model for DASU flags
  if (!CONFIG.ActiveEffect.dataModels) {
    CONFIG.ActiveEffect.dataModels = {};
  }
  CONFIG.ActiveEffect.dataModels.dasu = DASUActiveEffectData;

  // Register custom Active Effect configuration sheet
  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    ActiveEffect,
    'dasu',
    DASUActiveEffectConfig,
    {
      makeDefault: true,
      label: 'DASU.Sheet.ActiveEffect',
    }
  );

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

  registerHandlebarsHelpers();

  // Register status conditions early (before enrichers need them)
  // Note: Localization will be applied when ready hook fires
  CONFIG.DASU_STATUS_CONDITIONS = DASU_STATUS_CONDITIONS;

  // Register enrichers (must happen in init hook before content is enriched)
  registerEffectEnricher();
  initializeHealingEnricher();
  initializeDamageEnricher();
  initializeCostEnricher();

  // Initialize system controls
  SystemControls.initialize();

  // Import daemon fusion dialog (registers the system control button)
  import('./ui/daemon-fusion-dialog.mjs');
});

// Initialize event handlers when ready
Hooks.once('ready', function () {
  // Initialize effects system
  initializeEffects();

  // Initialize combat tracker enhancements
  initializeCombatTracker();

  // Import and initialize healing event handlers
  import('./systems/rolling/healing/event-handlers.mjs').then((module) => {
    if (module.initializeHealingEventHandlers) {
      module.initializeHealingEventHandlers();
    }
  });

  // Import and initialize target sheet handlers
  import('./utils/target-sheet-handlers.mjs').then((module) => {
    if (module.initializeTargetSheetHandlers) {
      module.initializeTargetSheetHandlers();
    }
  });

  // Initialize socketlib integration
  if (game.modules.get('socketlib')?.active) {
    if (!game.dasu) game.dasu = {};

    try {
      // eslint-disable-next-line no-undef
      game.dasu.socket = socketlib.registerSystem('dasu');

      // Handler for actor updates (applyDamage, applyHealing)
      const updateActorAsGM = async (actorUuid, updates) => {
        if (!game.user.isGM) {
          console.warn('DASU | Non-GM attempted updateActorAsGM');
          return;
        }

        const actor = await fromUuid(actorUuid);
        if (!actor) {
          console.error(`DASU | Actor not found: ${actorUuid}`);
          return;
        }

        await actor.update(updates);
      };

      // Handler for removing effect stacks
      const removeEffectStackAsGM = async (actorUuid, stackId) => {
        if (!game.user.isGM) {
          console.warn('DASU | Non-GM attempted removeEffectStackAsGM');
          return;
        }

        const actor = await fromUuid(actorUuid);
        if (!actor) {
          console.error(`DASU | Actor not found: ${actorUuid}`);
          return;
        }

        await actor.removeEffectStack(stackId, true);
      };

      // Handler for applying effects
      const applyEffectAsGM = async (actorUuid, effectData) => {
        if (!game.user.isGM) {
          console.warn('DASU | Non-GM attempted applyEffectAsGM');
          return;
        }

        const actor = await fromUuid(actorUuid);
        if (!actor) {
          console.error(`DASU | Actor not found: ${actorUuid}`);
          return;
        }

        await actor.createEmbeddedDocuments('ActiveEffect', [effectData]);
      };

      // Register handlers immediately
      game.dasu.socket.register('updateActorAsGM', updateActorAsGM);
      game.dasu.socket.register('removeEffectStackAsGM', removeEffectStackAsGM);
      game.dasu.socket.register('applyEffectAsGM', applyEffectAsGM);

      console.log('DASU | Socketlib initialized and handlers registered');
    } catch (error) {
      console.error('DASU | Error initializing socketlib:', error);
    }
  }
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
  // Register custom status conditions after localization is fully loaded
  registerStatusConditions();

  // Register item context menu options
  // Hook signature: (menuOptions, sheet, actor)
  Hooks.on('getItemContextMenuOptions', (menuOptions, sheet, actor) => {
    menuOptions.push({
      name: 'Ability Fusion',
      icon: '<i class="fas fa-layer-group"></i>',
      condition: function (itemId) {
        if (!itemId) return false;
        const item = actor.items.get(itemId);
        return item && item.type === 'ability';
      },
      callback: function (itemId, item) {
        if (item) {
          ui.notifications.info(`Ability Fusion activated for ${item.name}`);
          // TODO: Implement ability fusion logic
        }
      },
    });
  });

  // Wait to register hotbar drop hook on ready so that modules could register earlier if they want to
  Hooks.on('hotbarDrop', (bar, data, slot) => createDocMacro(data, slot));

  // Context menu hooks are now handled by individual modules in the rolling system
});

/* -------------------------------------------- */
/*  Combat Hooks                                */
/* -------------------------------------------- */

/**
 * Convert duration.rounds and duration.turns to custom tracking when effect is created
 * This hook handles effects created outside the EffectProcessor pipeline
 * (e.g., through Foundry's native UI or other modules)
 */
Hooks.on('preCreateActiveEffect', (effect, data, options, userId) => {
  // Only process if there's an active combat
  if (!game.combat) return;
  if (options.dasuProcessed) return;

  if (data.duration?.rounds && !data.flags?.dasu?.remainingRounds) {
    effect.updateSource({
      'flags.dasu.remainingRounds': data.duration.rounds,
      'flags.dasu.linkedCombat': game.combat.id,
    });
  }

  if (data.duration?.turns && !data.flags?.dasu?.remainingTurns) {
    effect.updateSource({
      'flags.dasu.remainingTurns': data.duration.turns,
      'flags.dasu.linkedCombat': game.combat.id,
      'flags.dasu.startRound': game.combat.round,
      'flags.dasu.startTurn': game.combat.turn,
      'flags.dasu.hasDecrementedOnce': false,
    });
  }
});

Hooks.on('preUpdateActiveEffect', (effect, changes, options, userId) => {
  if (
    effect.flags?.dasu?.remainingTurns !== undefined ||
    effect.flags?.dasu?.remainingRounds !== undefined
  ) {
    if (changes.duration) {
      delete changes.duration;

      if (Object.keys(changes).length === 0) {
        return false;
      }
    }
  }
});

/**
 * Initialize duration tracking for existing effects when combat starts
 * This handles effects that were created before combat began
 */
Hooks.on('createCombat', async (combat, options, userId) => {
  // Only run on GM's client
  if (!game.user.isGM) return;

  // Get all actors in the combat
  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!actor) continue;

    // Check each effect on the actor
    for (const effect of actor.effects) {
      // Skip effects that already have tracking initialized
      if (
        effect.flags?.dasu?.remainingTurns !== undefined ||
        effect.flags?.dasu?.remainingRounds !== undefined ||
        effect.flags?.dasu?.linkedCombat !== undefined
      ) {
        continue;
      }

      const updates = {};

      // Initialize remainingRounds if duration.rounds exists
      if (effect.duration?.rounds && effect.duration.rounds > 0) {
        updates['flags.dasu.remainingRounds'] = effect.duration.rounds;
        updates['flags.dasu.linkedCombat'] = combat.id;
      }

      // Initialize remainingTurns if duration.turns exists
      if (effect.duration?.turns && effect.duration.turns > 0) {
        updates['flags.dasu.remainingTurns'] = effect.duration.turns;
        updates['flags.dasu.linkedCombat'] = combat.id;
        updates['flags.dasu.startRound'] = combat.round;
        updates['flags.dasu.startTurn'] = combat.turn;
        updates['flags.dasu.hasDecrementedOnce'] = false;
      }

      // Apply updates if there are any
      if (Object.keys(updates).length > 0) {
        await effect.update(updates);
      }
    }
  }
});

/**
 * Initialize duration tracking when a combatant is added to an existing combat
 * This handles actors added to combat after it has started
 */
Hooks.on('createCombatant', async (combatant, options, userId) => {
  // Only run on GM's client
  if (!game.user.isGM) return;

  const actor = combatant.actor;
  if (!actor) return;

  const combat = combatant.combat;
  if (!combat) return;

  // Check each effect on the actor
  for (const effect of actor.effects) {
    // Skip effects that already have tracking initialized
    if (
      effect.flags?.dasu?.remainingTurns !== undefined ||
      effect.flags?.dasu?.remainingRounds !== undefined ||
      effect.flags?.dasu?.linkedCombat !== undefined
    ) {
      continue;
    }

    const updates = {};

    // Initialize remainingRounds if duration.rounds exists
    if (effect.duration?.rounds && effect.duration.rounds > 0) {
      updates['flags.dasu.remainingRounds'] = effect.duration.rounds;
      updates['flags.dasu.linkedCombat'] = combat.id;
    }

    // Initialize remainingTurns if duration.turns exists
    if (effect.duration?.turns && effect.duration.turns > 0) {
      updates['flags.dasu.remainingTurns'] = effect.duration.turns;
      updates['flags.dasu.linkedCombat'] = combat.id;
      updates['flags.dasu.startRound'] = combat.round;
      updates['flags.dasu.startTurn'] = combat.turn;
      updates['flags.dasu.hasDecrementedOnce'] = false;
    }

    // Apply updates if there are any
    if (Object.keys(updates).length > 0) {
      await effect.update(updates);
    }
  }
});

Hooks.on('updateCombat', async (combat, updateData, options, userId) => {
  if (!('turn' in updateData) && !('round' in updateData)) return;
  if (!game.user.isGM) return;

  const isRoundChange = 'round' in updateData;
  const isTurnChange = 'turn' in updateData;

  if (isRoundChange) {
    await _handleRoundBasedEffects(combat);

    // Only process all combatants' turn effects if "Next Round" was clicked (round changed without turn change)
    if (!isTurnChange) {
      await _handleAllCombatantsTurnEffects(combat);
    }
  }

  if (isTurnChange) {
    await _handleTurnBasedEffects(combat);
  }
});

async function _handleRoundBasedEffects(combat) {
  const allChatMessages = [];

  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!actor) continue;

    const effectsToDelete = [];

    for (const effect of actor.effects) {
      const remainingRounds = effect.getFlag('dasu', 'remainingRounds');
      const linkedCombat = effect.getFlag('dasu', 'linkedCombat');

      if (remainingRounds === undefined || linkedCombat !== combat.id) {
        continue;
      }

      const newRemaining = Math.max(0, remainingRounds - 1);

      if (newRemaining <= 0) {
        effectsToDelete.push(effect.id);

        allChatMessages.push({
          actor,
          effect,
          remainingRounds: 0,
          expired: true,
        });
      } else {
        await effect.setFlag('dasu', 'remainingRounds', newRemaining);

        allChatMessages.push({
          actor,
          effect,
          remainingRounds: newRemaining,
          expired: false,
        });
      }
    }

    if (effectsToDelete.length > 0) {
      await actor.deleteEmbeddedDocuments('ActiveEffect', effectsToDelete);
    }
  }

  // Batch send all chat messages at once
  for (const messageData of allChatMessages) {
    const content = await foundry.applications.handlebars.renderTemplate(
      'systems/dasu/templates/chat/effect-duration-update.hbs',
      messageData
    );

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: messageData.actor }),
      content,
      flags: {
        dasu: {
          type: 'effect-duration-update',
          effectId: messageData.effect.id,
        },
      },
    });
  }
}

async function _handleAllCombatantsTurnEffects(combat) {
  const allChatMessages = [];

  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!actor) continue;

    const effectsToDelete = [];

    for (const effect of actor.effects) {
      const remainingTurns = effect.getFlag('dasu', 'remainingTurns');
      const linkedCombat = effect.getFlag('dasu', 'linkedCombat');
      const startRound = effect.getFlag('dasu', 'startRound');
      const hasDecrementedOnce = effect.getFlag('dasu', 'hasDecrementedOnce');

      if (remainingTurns === undefined || linkedCombat !== combat.id) {
        continue;
      }

      if (!hasDecrementedOnce) {
        await effect.setFlag('dasu', 'hasDecrementedOnce', true);

        allChatMessages.push({
          actor,
          effect,
          remainingTurns: remainingTurns,
          expired: false,
        });
        continue;
      }

      const newRemaining = Math.max(0, remainingTurns - 1);

      if (newRemaining <= 0) {
        effectsToDelete.push(effect.id);

        allChatMessages.push({
          actor,
          effect,
          remainingTurns: 0,
          expired: true,
        });
      } else {
        await effect.setFlag('dasu', 'remainingTurns', newRemaining);

        allChatMessages.push({
          actor,
          effect,
          remainingTurns: newRemaining,
          expired: false,
        });
      }
    }

    if (effectsToDelete.length > 0) {
      await actor.deleteEmbeddedDocuments('ActiveEffect', effectsToDelete);
    }
  }

  // Batch send all chat messages at once
  for (const messageData of allChatMessages) {
    const content = await foundry.applications.handlebars.renderTemplate(
      'systems/dasu/templates/chat/effect-duration-update.hbs',
      messageData
    );

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: messageData.actor }),
      content,
      flags: {
        dasu: {
          type: 'effect-duration-update',
          effectId: messageData.effect.id,
        },
      },
    });
  }
}

async function _handleTurnBasedEffects(combat) {
  const combatant = combat.combatant;
  if (!combatant?.actor) return;

  const actor = combatant.actor;
  const effectsToDelete = [];
  const chatMessages = [];

  for (const effect of actor.effects) {
    const remainingTurns = effect.getFlag('dasu', 'remainingTurns');
    const linkedCombat = effect.getFlag('dasu', 'linkedCombat');
    const startRound = effect.getFlag('dasu', 'startRound');
    const hasDecrementedOnce = effect.getFlag('dasu', 'hasDecrementedOnce');

    if (remainingTurns === undefined || linkedCombat !== combat.id) {
      continue;
    }

    if (!hasDecrementedOnce && startRound === combat.round) {
      await effect.setFlag('dasu', 'hasDecrementedOnce', true);

      chatMessages.push({
        effect,
        remainingTurns: remainingTurns,
        expired: false,
      });
      continue;
    }

    const newRemaining = Math.max(0, remainingTurns - 1);

    if (newRemaining <= 0) {
      effectsToDelete.push(effect.id);

      chatMessages.push({
        effect,
        remainingTurns: 0,
        expired: true,
      });
    } else {
      await effect.setFlag('dasu', 'remainingTurns', newRemaining);

      chatMessages.push({
        effect,
        remainingTurns: newRemaining,
        expired: false,
      });
    }
  }

  if (effectsToDelete.length > 0) {
    await actor.deleteEmbeddedDocuments('ActiveEffect', effectsToDelete);
  }

  // Send chat messages for duration updates
  for (const messageData of chatMessages) {
    const content = await foundry.applications.handlebars.renderTemplate(
      'systems/dasu/templates/chat/effect-duration-update.hbs',
      messageData
    );

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
      flags: {
        dasu: {
          type: 'effect-duration-update',
          effectId: messageData.effect.id,
        },
      },
    });
  }
}

/**
 * Remove active effects with special duration "removeOnCombatEnd" when combat is deleted
 */
Hooks.on('deleteCombat', async (combat, options, userId) => {
  // Only run this on the GM's client to avoid duplicate deletions
  if (!game.user.isGM) return;

  // Get all actors that were in the combat
  const actorIds = new Set();
  for (const combatant of combat.combatants) {
    if (combatant.actor) {
      actorIds.add(combatant.actor.id);
    }
  }

  // For each actor, remove effects with removeOnCombatEnd flag
  for (const actorId of actorIds) {
    const actor = game.actors.get(actorId);
    if (!actor) continue;

    const effectsToRemove = [];
    for (const effect of actor.effects) {
      if (effect.flags?.dasu?.specialDuration === 'removeOnCombatEnd') {
        effectsToRemove.push(effect.id);
      }
    }

    if (effectsToRemove.length > 0) {
      await actor.deleteEmbeddedDocuments('ActiveEffect', effectsToRemove);
    }
  }
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

    // Trigger the item roll using Checks API
    return Checks.accuracyCheck(item.parent, item);
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

// --- Handle clicks on effect duration update chat cards and dice selection ---
Hooks.on('renderChatMessageHTML', (message, html) => {
  // html is already an HTMLElement in V13
  const htmlElement = html;

  const card = htmlElement.querySelector('.effect-duration-update');
  if (card) {
    const effectUuid = card.dataset.effectUuid;
    if (effectUuid) {
      // Handle click on effect image to open config
      const effectImage = card.querySelector('[data-action="openEffect"]');
      if (effectImage) {
        effectImage.addEventListener('click', async (event) => {
          event.preventDefault();

          const effect = await fromUuid(effectUuid);
          if (!effect) {
            ui.notifications.warn('Effect not found');
            return;
          }

          // Check permission
          if (!effect.parent?.testUserPermission(game.user, 'OWNER')) {
            ui.notifications.warn(
              'You do not have permission to edit this effect'
            );
            return;
          }

          effect.sheet.render(true);
        });
      }
    }
  }

  // --- Handle breakdown toggle button ---
  const breakdownToggle = htmlElement.querySelector(
    '[data-action="toggleBreakdown"]'
  );
  if (breakdownToggle) {
    breakdownToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const card = breakdownToggle.closest('.check-card, .roll-card');
      if (card) {
        const breakdownSection = card.querySelector('.breakdown-section');
        if (breakdownSection) {
          const isHidden = breakdownSection.style.display === 'none';
          breakdownSection.style.display = isHidden ? 'block' : 'none';
          // Rotate the icon
          const icon = breakdownToggle.querySelector('i');
          if (icon) {
            icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
          }
        }
      }
    });
  }

  // --- Handle pay cost button ---
  const costButtons = htmlElement.querySelectorAll('[data-action^="pay"]');
  costButtons.forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      const card = button.closest('.roll-card');
      if (!card) return;

      const actorId = card.dataset.actorId;
      let cost = Number(button.dataset.cost);
      const costType = button.dataset.costType;
      const action = button.dataset.action;

      if (action === 'payHalfCost') {
        cost = Math.ceil(cost / 2);
      }

      if (!actorId || !cost) return;

      const actor = game.actors.get(actorId);
      if (!actor || !actor.system.stats) return;

      // Determine which resource to reduce
      let updatePath;
      let currentValue;
      let resourceTarget = costType;

      if (costType === 'wp' && actor.system.stats.wp) {
        updatePath = 'system.stats.wp.current';
        currentValue = actor.system.stats.wp.current;
      } else if (costType === 'sp' && actor.system.stats.hp) {
        // SP (Stamina Points) maps to HP
        updatePath = 'system.stats.hp.current';
        currentValue = actor.system.stats.hp.current;
        resourceTarget = 'hp';
      } else if (costType === 'mp' && actor.system.stats.wp) {
        // MP (Mana Points) also maps to WP
        updatePath = 'system.stats.wp.current';
        currentValue = actor.system.stats.wp.current;
        resourceTarget = 'wp';
      } else {
        ui.notifications.warn(
          'Unable to pay cost: resource not found on actor'
        );
        return;
      }

      const actualCost = Math.min(cost, currentValue);
      const newValue = Math.max(0, currentValue - cost);
      await actor.update({ [updatePath]: newValue });

      // Get token ID for unlinked tokens
      const token = actor.getActiveTokens()[0];
      const tokenId = token ? token.id : null;

      // Build chat message content
      const icon = '<i class="fas fa-coins"></i>';
      const targetAttrs = `data-actor-id="${actor.id}"${
        tokenId ? ` data-token-id="${tokenId}"` : ''
      }`;

      const costText = actualCost > 0 ? 'paid' : 'attempted to pay';

      const content = `
    <div class='dasu cost-applied'>
      <div class='cost-applied-content'>
        <div class='cost-text'>
          <span class='cost-icon'>${icon}</span>
          <strong class="target-name clickable" ${targetAttrs}>${
        actor.name
      }</strong> ${costText}
          ${
            actualCost > 0
              ? ` <strong class='cost-amount'>${actualCost}</strong> ${costType.toUpperCase()}`
              : ''
          }
        </div>
        <div class='cost-actions-small'>
          <button class='cost-action-btn undo' data-action='undoCost' data-target-id='${
            actor.id
          }' data-amount='${actualCost}' data-resource='${resourceTarget}'>
            <i class='fas fa-undo'></i>Undo
          </button>
        </div>
      </div>
    </div>
      `;

      // Create chat message
      await ChatMessage.create({
        content,
        speaker: ChatMessage.getSpeaker({ actor }),
        style: foundry.CONST.CHAT_MESSAGE_STYLES.OTHER,
        flavor: `<span class="flavor-text">cost paid (${cost}: = ${actualCost})</span>`,
        flags: {
          dasu: {
            costApplication: {
              targetId: actor.id,
              targetName: actor.name,
              appliedCost: actualCost,
              costType: resourceTarget,
              baseCost: cost,
            },
            enricherCost: true,
          },
        },
      });
    });
  });
});
