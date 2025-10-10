// Actor Data Models
export { default as BaseActorDataModel } from '../actors/base-actor.mjs';
export { default as DaemonDataModel } from '../actors/actor-daemon.mjs';
export { default as SummonerDataModel } from '../actors/actor-summoner.mjs';

// Item Data Models
export { default as BaseItemDataModel } from '../items/item-base.mjs';
export { default as AbilityDataModel } from '../items/item-ability.mjs';
export { default as ItemDataModel } from '../items/item-item.mjs';
export { default as WeaponDataModel } from '../items/item-weapon.mjs';
export { default as TagDataModel } from '../items/item-tag.mjs';
export { default as TacticDataModel } from '../items/item-tactic.mjs';
export { default as SpecialDataModel } from '../items/item-special.mjs';
export { default as ScarDataModel } from '../items/item-scar.mjs';
export { default as SchemaDataModel } from '../items/item-schema.mjs';
export { default as FeatureDataModel } from '../items/item-feature.mjs';
export { default as ClassDataModel } from '../items/item-class.mjs';
export { default as ArchetypeDataModel } from '../items/item-archetype.mjs';
export { default as SubtypeDataModel } from '../items/item-subtype.mjs';
export { default as RoleDataModel } from '../items/item-role.mjs';

// Shared Components
export { SharedActorComponents } from './components.mjs';

import {
  grantLevelingItem,
  revokeLevelingItems,
} from '../../ui/applications/leveling-wizard.mjs';

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
    // Grant planned feature
    if (levelingData.feature?.[newLevel]) {
      await grantLevelingItem(actor, levelingData.feature[newLevel], newLevel);
      delete levelingData.feature[newLevel];
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
