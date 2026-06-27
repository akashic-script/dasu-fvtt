import DASUItemBase from "./item-base.mjs";
import { DASU } from "../helpers/config.mjs";
import { EffectField, QuantityField, ResourceField } from "./fields/index.mjs";

export default class DASUItem extends DASUItemBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    schema.category = new fields.StringField({
      required: true,
      blank: false,
      initial: 'restorative',
      choices: DASU.itemCategories,
    });
    schema.quantity = QuantityField();
    schema.effects = new fields.ArrayField(EffectField());
    schema.resource = ResourceField();

    return schema;
  }
}
