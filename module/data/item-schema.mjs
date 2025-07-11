import BaseItemDataModel from './item-base.mjs';

export default class SchemaDataModel extends BaseItemDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    const baseSchema = super.defineSchema();

    return {
      ...baseSchema,
      // Add system.level (max 3)
      level: new fields.NumberField({
        required: true,
        initial: 1,
        min: 1,
        max: 3,
      }),
      // Replace levels array with three separate objects for each level
      level1: new fields.SchemaField({
        description: new fields.StringField({ required: false, initial: '' }),
      }),
      level2: new fields.SchemaField({
        description: new fields.StringField({ required: false, initial: '' }),
      }),
      level3: new fields.SchemaField({
        description: new fields.StringField({ required: false, initial: '' }),
      }),
      description: new fields.StringField({ required: false, initial: '' }),
      requirements: new fields.StringField({ required: false, initial: '' }),
      cost: new fields.NumberField({ required: false, initial: 0 }),
    };
  }

  prepareDerivedData() {
    super.prepareDerivedData();
  }
}
