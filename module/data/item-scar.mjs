import BaseItemDataModel from './item-base.mjs';

export default class ScarDataModel extends BaseItemDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    const baseSchema = super.defineSchema();
    return {
      ...baseSchema,
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
