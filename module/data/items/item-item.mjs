import BaseItemDataModel from './item-base.mjs';

export default class ItemDataModel extends BaseItemDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    const baseSchema = super.defineSchema();
    return {
      ...baseSchema,
      cost: new fields.NumberField({ required: true, initial: 0 }),
      quantity: new fields.NumberField({ required: true, initial: 1 }),
    };
  }

  prepareDerivedData() {
    super.prepareDerivedData();

    // Ensure cost is a single number, not an array
    if (Array.isArray(this.cost)) {
      this.cost = this.cost[1] || 0;
    }

    // Ensure quantity is a single number, not an array
    if (Array.isArray(this.quantity)) {
      this.quantity = this.quantity[1] || 1;
    }
  }
}
