import { DASUActor } from './documents/actor.mjs';
import { DASUActiveEffect } from './documents/active-effect.mjs';
import { DASUItem } from './documents/item.mjs';
import { DASUSummonerActorSheet } from './sheets/summoner-actor-sheet.mjs';
import { DASUDaemonActorSheet } from './sheets/daemon-actor-sheet.mjs';
import { DASUItemSheet } from './sheets/item-sheet.mjs';
import { preloadHandlebarsTemplates } from './helpers/templates.mjs';
import { DASU } from './helpers/config.mjs';
import { FieldsetStateManager } from './helpers/fieldset-state.mjs';
import { DASUActorSheet } from './sheets/actor-sheet.mjs';
import { DASUTableRenderer } from './helpers/tables/table-renderer.mjs';
import { CommonColumns } from './helpers/tables/common-columns.mjs';
import { CommonDescriptions } from './helpers/tables/common-descriptions.mjs';
import { Checks, initializeChecks } from './checks/checks.mjs';
import { DASUCombat, initializeCombat } from './documents/combat.mjs';
import { DASUCombatant } from './documents/combatant.mjs';
import { DASUCombatTracker } from './sheets/combat-tracker.mjs';
import { DASUActorDirectory } from './ui/actor-directory.mjs';
import { DASUPartyActorSheet } from './sheets/party-actor-sheet.mjs';
import { initializePartyAuras } from './helpers/party-aura.mjs';
import { registerCombatSettings } from './helpers/combat-settings.mjs';
import { initializePipelines } from './helpers/pipelines/_module.mjs';
import { DASUSocketHandler } from './helpers/socket.mjs';
import { initializeInlineEnrichers } from './enrichers/_module.mjs';
import { initializeStatusEffects } from './helpers/status-effects.mjs';
import { DASUActiveEffectConfig } from './sheets/active-effect-config.mjs';
import {
  resyncCatalogTag,
  handleCatalogTagDeleted,
} from './helpers/tag-slotting.mjs';
import * as models from './data/_module.mjs';

Hooks.once('init', function () {
  game.dasu = {
    DASUActor,
    DASUItem,
    Checks,
    rollItemMacro,
    FieldsetStateManager,
    DASUTableRenderer,
    CommonColumns,
    CommonDescriptions,
    registerItemTable: DASUActorSheet.registerItemTable.bind(DASUActorSheet),
    advancements: {
      BaseAdvancement: models.BaseAdvancement,
      ADVANCEMENT_TYPES: models.ADVANCEMENT_TYPES,
      register: (cls) => models.BaseAdvancement.registerType(cls),
    },
    tags: {
      BaseTag: models.BaseTag,
      TAG_TYPES: models.TAG_TYPES,
      register: (cls) => models.BaseTag.registerType(cls),
    },
    socket: new DASUSocketHandler(),
  };

  CONFIG.DASU = DASU;

  registerHandlebarsHelpers();
  registerCombatSettings();
  initializeChecks();
  initializePipelines();
  initializeStatusEffects();
  initializeInlineEnrichers();
  initializeCombat();

  // Initiative is rolled through the DASU check pipeline (2d10 + DEX / skill),
  // not a static formula; see DASUCombat#rollInitiative. `decimals` still tunes
  // the tracker's numeric display.
  CONFIG.Combat.initiative = { formula: null, decimals: 0 };

  CONFIG.Combat.documentClass = DASUCombat;
  CONFIG.Combatant.documentClass = DASUCombatant;
  Object.assign(CONFIG.Combat.dataModels, { base: models.DASUCombatData });
  Object.assign(CONFIG.Combatant.dataModels, {
    base: models.DASUCombatantData,
  });
  CONFIG.ui.combat = DASUCombatTracker;

  CONFIG.ActiveEffect.documentClass = DASUActiveEffect;
  CONFIG.Actor.documentClass = DASUActor;
  Object.assign(CONFIG.Actor.dataModels, {
    summoner: models.DASUSummoner,
    daemon: models.DASUDaemon,
    party: models.DASUParty,
  });

  CONFIG.Actor.trackableAttributes = {
    summoner: { bar: ['resources.hp', 'resources.wp'], value: [] },
    daemon: { bar: ['resources.hp', 'resources.wp'], value: [] },
  };

  CONFIG.ui.actors = DASUActorDirectory;
  game.settings.register('dasu', 'partySidebarState', {
    scope: 'client',
    config: false,
    type: Array,
    default: [],
  });
  game.settings.register('dasu', 'partyLayout', {
    scope: 'client',
    config: false,
    type: String,
    default: 'card',
  });
  game.settings.register('dasu', 'activeParty', {
    name: 'DASU.Settings.ActiveParty.Name',
    hint: 'DASU.Settings.ActiveParty.Hint',
    scope: 'world',
    config: true,
    type: String,
    choices: activePartyChoices,
    default: '',
  });

  game.keybindings.register('dasu', 'openActiveParty', {
    name: 'DASU.Party.OpenActiveParty',
    editable: [{ key: 'KeyP' }],
    onDown: () => {
      const party = game.actors.get(game.settings.get('dasu', 'activeParty'));
      if (!party) {
        ui.notifications.warn(game.i18n.localize('DASU.Party.NoActiveParty'));
        return true;
      }
      if (party.sheet.rendered) party.sheet.close();
      else party.sheet.render(true);
      return true;
    },
  });

  CONFIG.Item.documentClass = DASUItem;
  Object.assign(CONFIG.Item.dataModels, {
    item: models.DASUItem,
    weapon: models.DASUWeapon,
    feature: models.DASUFeature,
    class: models.DASUClass,
    ability: models.DASUAbility,
    tactic: models.DASUTactic,
    schema: models.DASUSchema,
    archetype: models.DASUArchetype,
    subtype: models.DASUSubtype,
    bond: models.DASUBond,
    specialAbility: models.DASUSpecialAbility,
    skillAbility: models.DASUSkillAbility,
    scar: models.DASUScar,
    dejection: models.DASUDejection,
    tag: models.DASUTag,
  });

  Object.assign(CONFIG.ChatMessage.dataModels, {
    pipeline: models.PipelineMessageModel,
  });

  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    Actor,
    'dasu',
    DASUSummonerActorSheet,
    { types: ['summoner'], makeDefault: true, label: 'DASU.SheetLabels.Actor' }
  );
  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    Actor,
    'dasu',
    DASUDaemonActorSheet,
    { types: ['daemon'], makeDefault: true, label: 'DASU.SheetLabels.Actor' }
  );
  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    Actor,
    'dasu',
    DASUPartyActorSheet,
    { types: ['party'], makeDefault: true, label: 'DASU.SheetLabels.Party' }
  );
  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    Item,
    'dasu',
    DASUItemSheet,
    {
      types: [
        'item',
        'weapon',
        'feature',
        'class',
        'ability',
        'tactic',
        'schema',
        'archetype',
        'subtype',
        'bond',
        'specialAbility',
        'skillAbility',
        'scar',
        'dejection',
        'tag',
      ],
      makeDefault: true,
      label: 'DASU.SheetLabels.Item',
    }
  );

  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    ActiveEffect,
    'dasu',
    DASUActiveEffectConfig,
    { makeDefault: true, label: 'DASU.SheetLabels.Effect' }
  );

  return preloadHandlebarsTemplates();
});

function registerHandlebarsHelpers() {
  Handlebars.registerHelper('toLowerCase', (str) => str.toLowerCase());
  Handlebars.registerHelper('capitalize', (str) =>
    str ? str.charAt(0).toUpperCase() + str.slice(1) : ''
  );
  Handlebars.registerHelper('gte', (a, b) => a >= b);
  Handlebars.registerHelper('eq', (a, b) => a === b);
  Handlebars.registerHelper('add', (a, b) => Number(a) + Number(b));
  Handlebars.registerHelper('concat', (...args) => args.slice(0, -1).join(''));
}

Hooks.once('ready', async function () {
  Hooks.on('hotbarDrop', (bar, data, slot) => createItemMacro(data, slot));
  for (const actor of game.actors) actor.applySchemaUpgrades?.();

  if (game.user.isGM) {
    Promise.resolve(backfillDaemonOwnership()).catch((err) =>
      Hooks.onError('ready#backfillDaemonOwnership', err, {
        log: 'error',
        notify: 'error',
      })
    );
  }

  // When a catalog tag's applicability is edited, reconcile its slotted copies.
  // Runs once, on the client that owns the actor (or the active GM)
  Hooks.on('updateItem', (item, changes, options, userId) => {
    if (item.type !== 'tag') return;
    if (game.userId !== userId) return;
    const applChanged =
      foundry.utils.hasProperty(changes, 'system.applicableTypes') ||
      foundry.utils.hasProperty(changes, 'system.applicableSubType');
    if (applChanged) {
      Promise.resolve(resyncCatalogTag(item)).catch((err) =>
        Hooks.onError('updateItem#resyncCatalogTag', err, {
          log: 'error',
          notify: 'error',
        })
      );
    }
  });

  // When a catalog tag is deleted, unslot its copies so nothing is orphaned.
  Hooks.on('deleteItem', (item, options, userId) => {
    if (item.type !== 'tag') return;
    if (game.userId !== userId) return;
    Promise.resolve(handleCatalogTagDeleted(item)).catch((err) =>
      Hooks.onError('deleteItem#handleCatalogTagDeleted', err, {
        log: 'error',
        notify: 'error',
      })
    );
  });

  // When a summoner is deleted, release its rostered daemons: null out their
  // system.summonerId so an orphaned owner reference never blocks re-slotting.
  Hooks.on('deleteActor', (actor, options, userId) => {
    if (actor.type !== 'summoner') return;
    if (game.userId !== userId) return;
    const uuids = (actor.system?.stock ?? []).map((e) => e.uuid);
    if (!uuids.length) return;
    Promise.resolve(releaseDaemonOwnership(actor.id, uuids)).catch((err) =>
      Hooks.onError('deleteActor#releaseDaemonOwnership', err, {
        log: 'error',
        notify: 'error',
      })
    );
  });

  // When a summoner is deleted, prune it from every party's members. The
  // Roster is derived from member stocks.
  Hooks.on('deleteActor', (actor, options, userId) => {
    if (actor.type !== 'summoner') return;
    if (game.userId !== userId) return;
    Promise.resolve(pruneDeletedMemberFromParties(actor.uuid)).catch((err) =>
      Hooks.onError('deleteActor#pruneDeletedMemberFromParties', err, {
        log: 'error',
        notify: 'error',
      })
    );
  });

  // A daemon dragged out of a party's Storage onto the plain sidebar (or a
  // real Folder) moves via core's own directory drop handling.
  Hooks.on('updateActor', (actor, changes, options, userId) => {
    if (actor.type !== 'daemon') return;
    if (game.userId !== userId) return;
    if (!foundry.utils.hasProperty(changes, 'folder')) return;
    Promise.resolve(pruneMovedDaemonFromStorage(actor.uuid)).catch((err) =>
      Hooks.onError('updateActor#pruneMovedDaemonFromStorage', err, {
        log: 'error',
        notify: 'error',
      })
    );
  });

  // Party auras: broadcast flagged party effects onto member summoners.
  initializePartyAuras();

  // Keep every open party sheet's active-party badge/menu label in sync.
  Hooks.on('updateSetting', (setting) => {
    if (setting.key !== 'dasu.activeParty') return;
    for (const app of DASUPartyActorSheet.instances())
      app.render({ window: { title: app.title } });
  });

  // Clear the active-party setting if that party is deleted.
  Hooks.on('deleteActor', (actor) => {
    if (actor.type !== 'party') return;
    if (game.settings.get('dasu', 'activeParty') === actor.id) {
      game.settings.set('dasu', 'activeParty', '');
    }
  });

  Hooks.callAll('dasu.ready', game.dasu);
});

/**
 * Backfill `system.summonerId` on daemons from summoners' current stock, and
 * enforce single ownership. A daemon that (illegally) sits in several summoners'
 * stock is kept by the first and strippedfrom the rest.
 */
async function backfillDaemonOwnership() {
  const claimed = new Map(); // daemonUuid -> summonerId (first owner wins)
  const stockUpdates = []; // { _id, 'system.stock' } to strip later owners

  for (const summoner of game.actors) {
    if (summoner.type !== 'summoner') continue;
    const stock = summoner.system?.stock ?? [];
    let stripped = null;
    for (const entry of stock) {
      if (claimed.has(entry.uuid)) {
        stripped ??= foundry.utils.deepClone(stock);
        const row = stripped.find((e) => e.uuid === entry.uuid);
        if (row) {
          row.active = false;
          row.channeled = false;
          row._strip = true;
        }
      } else {
        claimed.set(entry.uuid, summoner.id);
      }
    }
    if (stripped) {
      stockUpdates.push({
        _id: summoner.id,
        'system.stock': stripped.filter((e) => !e._strip),
      });
    }
  }

  if (stockUpdates.length) {
    await Actor.updateDocuments(stockUpdates);
  }

  // Set summonerId on each first-owned daemon (skip if already correct).
  const daemonUpdates = [];
  for (const [uuid, summonerId] of claimed) {
    const daemon = await fromUuid(uuid);
    if (daemon?.type !== 'daemon') continue;
    if (daemon.system?.summonerId !== summonerId) {
      daemonUpdates.push({ _id: daemon.id, 'system.summonerId': summonerId });
    }
  }
  if (daemonUpdates.length) {
    await Actor.updateDocuments(daemonUpdates);
  }
}

/**
 * Clear `system.summonerId` on daemons that pointed at a now-deleted summoner,
 * so an orphaned owner reference never blocks re-slotting them elsewhere.
 * @param {string} summonerId  The deleted summoner's actor id.
 * @param {string[]} uuids     UUIDs of daemons it rostered.
 */
async function releaseDaemonOwnership(summonerId, uuids) {
  for (const uuid of uuids) {
    const daemon = await fromUuid(uuid);
    if (!daemon?.isOwner || daemon.type !== 'daemon') continue;
    if (daemon.system?.summonerId === summonerId) {
      await daemon.update({ 'system.summonerId': null });
    }
  }
}

/**
 * Dropdown choices for the "Active Party" setting.
 * @returns {Record<string, string>}
 */
function activePartyChoices() {
  const choices = { '': game.i18n.localize('DASU.Settings.ActiveParty.None') };
  for (const party of game.actors) {
    if (party.type === 'party')
      choices[party.id] = `${party.name} (${party.id})`;
  }
  return choices;
}

/**
 * Remove a deleted summoner's uuid from every party's system.members.
 * @param {string} summonerUuid
 */
async function pruneDeletedMemberFromParties(summonerUuid) {
  for (const party of game.actors) {
    if (party.type !== 'party') continue;
    if (!party.system.members.has(summonerUuid)) continue;
    await party.system.removeMember(summonerUuid);
  }
}

/**
 * Remove a daemon's uuid from every party's system.storage. Used when a
 * stored daemon is moved to a real folder.
 * @param {string} daemonUuid
 */
async function pruneMovedDaemonFromStorage(daemonUuid) {
  for (const party of game.actors) {
    if (party.type !== 'party') continue;
    if (!party.system.storage.has(daemonUuid)) continue;
    await party.system.removeFromStorage(daemonUuid);
  }
}

async function createItemMacro(data, slot) {
  if (data.type !== 'Item') return;
  if (!data.uuid.includes('Actor.') && !data.uuid.includes('Token.')) {
    return ui.notifications.warn(
      'You can only create macro buttons for owned Items'
    );
  }
  const item = await Item.fromDropData(data);
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

function rollItemMacro(itemUuid) {
  const dropData = {
    type: 'Item',
    uuid: itemUuid,
  };
  Item.fromDropData(dropData).then((item) => {
    if (!item || !item.parent) {
      const itemName = item?.name ?? itemUuid;
      return ui.notifications.warn(
        `Could not find item ${itemName}. You may need to delete and recreate this macro.`
      );
    }
    item.roll();
  });
}
