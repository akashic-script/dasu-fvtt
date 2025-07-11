import BaseItemDataModel from './item-base.mjs';

export default class TacticDataModel extends BaseItemDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    const baseSchema = super.defineSchema();
    return {
      ...baseSchema,
      govern: new fields.StringField({
        required: true,
        choices: ['pow', 'dex', 'will', 'sta'],
      }),
      damage: new fields.SchemaField({
        value: new fields.NumberField({ required: true, initial: 0 }),
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
        }),
      }),
      toLand: new fields.NumberField({ required: true, initial: 0 }),
      isInfinity: new fields.BooleanField({ required: false, initial: false }),
      cost: new fields.NumberField({ required: true, initial: 0 }),
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
