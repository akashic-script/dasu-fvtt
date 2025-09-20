// Actor Data Models
export { default as BaseActorDataModel } from './base-actor.mjs';
export { default as DaemonDataModel } from './actor-daemon.mjs';
export { default as SummonerDataModel } from './actor-summoner.mjs';

// Item Data Models
export { default as BaseItemDataModel } from './item-base.mjs';
export { default as AbilityDataModel } from './item-ability.mjs';
export { default as ItemDataModel } from './item-item.mjs';
export { default as WeaponDataModel } from './item-weapon.mjs';
export { default as TagDataModel } from './item-tag.mjs';
export { default as TacticDataModel } from './item-tactic.mjs';
export { default as SpecialDataModel } from './item-special.mjs';
export { default as ScarDataModel } from './item-scar.mjs';
export { default as SchemaDataModel } from './item-schema.mjs';
export { default as FeatureDataModel } from './item-feature.mjs';
export { default as ClassDataModel } from './item-class.mjs';

// Shared Components
export { SharedActorComponents } from './shared/components.mjs';

import {
  grantLevelingItem,
  revokeLevelingItems,
} from '../applications/leveling-wizard.mjs';

Hooks.on('updateActor', async (actor, data, options, userId) => {
  if (!actor || !actor.system?.levelingData) return;

  // Only run if level changed
  if (data.system?.level && data.system.level !== actor.system.level) {
    const newLevel = data.system.level;
    const oldLevel = actor.system.level;
    const levelingData = actor.system.levelingData;
    if (!levelingData) return;

    // Grant planned abilities
    if (levelingData.abilities?.[newLevel]) {
      await grantLevelingItem(
        actor,
        levelingData.abilities[newLevel],
        newLevel
      );
      delete levelingData.abilities[newLevel];
    }
    // Grant planned strengthOfWill
    if (levelingData.strengthOfWill?.[newLevel]) {
      await grantLevelingItem(
        actor,
        levelingData.strengthOfWill[newLevel],
        newLevel
      );
      delete levelingData.strengthOfWill[newLevel];
    }
    // Grant planned schemas
    // Determine schemaType for this level (copied from LevelingWizard._getSchemaTypeForLevel)
    let schemaType = null;
    if ([1, 5, 15, 25].includes(newLevel)) {
      schemaType = 'first';
    } else if ([10, 20].includes(newLevel)) {
      schemaType = 'second';
    }
    if (schemaType && levelingData.schemas?.[schemaType]) {
      await grantLevelingItem(
        actor,
        levelingData.schemas[schemaType],
        newLevel
      );
      delete levelingData.schemas[schemaType];
    }

    await actor.update({ 'system.levelingData': levelingData });

    // Revoke if level down
    if (oldLevel > newLevel) {
      await revokeLevelingItems(actor, oldLevel);
    }
  }
});
