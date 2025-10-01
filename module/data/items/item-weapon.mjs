import BaseItemDataModel from './item-base.mjs';
import { TaggableMixin } from '../mixins/taggable.mjs';

if (!globalThis.DASU_TAGGABLE_TYPES) globalThis.DASU_TAGGABLE_TYPES = [];
if (!globalThis.DASU_TAGGABLE_TYPES.includes('weapon'))
  globalThis.DASU_TAGGABLE_TYPES.push('weapon');

export default class WeaponDataModel extends TaggableMixin(BaseItemDataModel) {
  static defineSchema() {
    const fields = foundry.data.fields;
    const baseSchema = super.defineSchema();
    return {
      ...baseSchema,
      govern: new fields.StringField({
        required: true,
        choices: ['none', 'pow', 'dex', 'will', 'sta'],
        initial: 'pow',
      }),
      range: new fields.StringField({
        required: true,
        choices: ['melee', 'ranged'],
        initial: 'melee',
      }),
      damage: new fields.SchemaField({
        value: new fields.NumberField({ required: true, initial: 1 }),
        type: new fields.StringField({
          required: true,
          choices: [
            'physical',
            'fire',
            'ice',
            'electric',
            'wind',
            'earth',
            'light',
            'dark',
            'untyped',
          ],
          initial: 'physical',
        }),
      }),
      toHit: new fields.NumberField({ required: true, initial: 0 }),
      cost: new fields.NumberField({ required: true, initial: 0 }),
    };
  }

  prepareDerivedData() {
    // Initialize tag slots if they don't exist
    if (!this.tagSlots) {
      this.tagSlots = {
        slot1: { tagId: null, rank: 1 },
        slot2: { tagId: null, rank: 1 },
      };
    }
  }
}
