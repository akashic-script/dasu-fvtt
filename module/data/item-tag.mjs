import BaseItemDataModel from './item-base.mjs';

export default class TagDataModel extends BaseItemDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    const baseSchema = super.defineSchema();
    return {
      ...baseSchema,
      description: new fields.StringField({ required: false, blank: true }),
      rank: new fields.SchemaField({
        current: new fields.NumberField({
          required: false,
          initial: 1,
          min: 1,
        }),
        max: new fields.NumberField({ required: false, initial: 1, min: 1 }),
      }),
      price: new fields.NumberField({ required: false, initial: 0, min: 0 }),
      rarity: new fields.StringField({
        required: false,
        initial: 'common',
        choices: ['common', 'uncommon', 'rare', 'epic', 'legendary'],
      }),
      slotType: new fields.ArrayField(
        new fields.StringField({
          required: false,
          choices: ['all', ...(globalThis.DASU_TAGGABLE_TYPES || [])],
        }),
        {
          required: false,
          initial: ['weapon'],
        }
      ),
    };
  }

  prepareDerivedData() {
    // Ensure rank.current and rank.max are valid numbers
    if (!this.rank || typeof this.rank !== 'object') {
      this.rank = { current: 1, max: 1 };
    }
    if (typeof this.rank.current !== 'number' || this.rank.current < 1) {
      this.rank.current = 1;
    }
    if (typeof this.rank.max !== 'number' || this.rank.max < 1) {
      this.rank.max = 1;
    }
    if (this.rank.current > this.rank.max) {
      this.rank.current = this.rank.max;
    }

    // Ensure price is a valid number
    if (typeof this.price !== 'number' || this.price < 0) {
      this.price = 0;
    }

    // Ensure rarity is valid
    const validRarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    if (!validRarities.includes(this.rarity)) {
      this.rarity = 'common';
    }

    // Ensure slotType is an array of valid types
    const validSlotTypes = ['weapon', 'armor', 'general', 'accessory'];
    if (!Array.isArray(this.slotType)) {
      this.slotType = [this.slotType].filter((t) => validSlotTypes.includes(t));
    } else {
      this.slotType = this.slotType.filter((t) => validSlotTypes.includes(t));
    }
    if (this.slotType.length === 0) {
      this.slotType = ['weapon'];
    }
  }

  isValidForItem(item) {
    if (!Array.isArray(this.slotType)) return false;
    return this.slotType.includes('all') || this.slotType.includes(item.type);
  }
}
