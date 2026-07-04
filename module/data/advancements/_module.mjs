import BaseAdvancement from './base-advancement.mjs';
import AptitudeAdvancement from './aptitude-advancement.mjs';
import SchemaSlotAdvancement from './schema-slot-advancement.mjs';
import SchemaUpgradeAdvancement from './schema-upgrade-advancement.mjs';
import ItemGrantAdvancement from './item-grant-advancement.mjs';
import RelentlessCurseAdvancement from './relentless-curse-advancement.mjs';

export const ADVANCEMENT_TYPES = [
  AptitudeAdvancement,
  SchemaSlotAdvancement,
  SchemaUpgradeAdvancement,
  ItemGrantAdvancement,
  RelentlessCurseAdvancement,
];

for (const cls of ADVANCEMENT_TYPES) BaseAdvancement.registerType(cls);

export {
  BaseAdvancement,
  AptitudeAdvancement,
  SchemaSlotAdvancement,
  SchemaUpgradeAdvancement,
  ItemGrantAdvancement,
  RelentlessCurseAdvancement,
};
