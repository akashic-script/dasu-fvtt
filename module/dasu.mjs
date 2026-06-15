import { DASUActor } from './documents/actor.mjs';
import { DASUItem } from './documents/item.mjs';
import { DASUSummonerActorSheet } from './sheets/summoner-actor-sheet.mjs';
import { DASUDaemonActorSheet } from './sheets/daemon-actor-sheet.mjs';
import { DASUItemSheet } from './sheets/item-sheet.mjs';
import { preloadHandlebarsTemplates } from './helpers/templates.mjs';
import { DASU } from './helpers/config.mjs';
import * as models from './data/_module.mjs';

Hooks.once('init', function () {
  game.dasu = {
    DASUActor,
    DASUItem,
    rollItemMacro,
  };

  CONFIG.DASU = DASU;

  CONFIG.Combat.initiative = {
    formula: '1d20 + @attributes.dex.value',
    decimals: 2,
  };

  CONFIG.Actor.documentClass = DASUActor;
  Object.assign(CONFIG.Actor.dataModels, {
    summoner: models.DASUSummoner,
    daemon: models.DASUDaemon,
  });

  CONFIG.Item.documentClass = DASUItem;
  Object.assign(CONFIG.Item.dataModels, {
    item: models.DASUItem,
    weapon: models.DASUWeapon,
    feature: models.DASUFeature,
    class: models.DASUClass,
    ability: models.DASUAbility,
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
    Item,
    'dasu',
    DASUItemSheet,
    {
      types: ['item', 'weapon', 'feature', 'class', 'ability'],
      makeDefault: true,
      label: 'DASU.SheetLabels.Item',
    }
  );

  return preloadHandlebarsTemplates();
});

Handlebars.registerHelper('toLowerCase', (str) => str.toLowerCase());

Hooks.once('ready', function () {
  Hooks.on('hotbarDrop', (bar, data, slot) => createItemMacro(data, slot));
});

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
