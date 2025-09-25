import BaseItemDataModel from './item-base.mjs';

export default class SpecialDataModel extends BaseItemDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    const baseSchema = super.defineSchema();
    return {
      ...baseSchema,
      specialType: new fields.StringField({
        required: true,
        choices: ['transformation', 'ability'],
      }),
      cost: new fields.NumberField({ required: false, initial: 0 }),
      duration: new fields.NumberField({ required: false, initial: 0 }),
      requirements: new fields.StringField({ required: false }),
      effects: new fields.ArrayField(
        new fields.SchemaField({
          type: new fields.StringField({ required: true }),
          value: new fields.StringField({ required: true }),
          target: new fields.StringField({ required: false }),
        }),
        { required: false }
      ),
      effect: new fields.StringField({ required: false, blank: true }),
    };
  }

  prepareDerivedData() {
    super.prepareDerivedData();

    // Ensure effect is a single string, not an array
    if (Array.isArray(this.effect)) {
      this.effect = this.effect[1] || '';
    }
  }
}
