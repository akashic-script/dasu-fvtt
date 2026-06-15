import DASUItemBase from "./item-base.mjs";
import { DASU } from "../helpers/config.mjs";

export default class DASUItem extends DASUItemBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    schema.quantity = new fields.NumberField({ ...requiredInteger, initial: 1, min: 1 });

    schema.effect = new fields.SchemaField({
      resource: new fields.StringField({
        required: true,
        blank: false,
        initial: "hp",
        choices: Object.keys(DASU.itemResources),
      }),
      value: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      mode: new fields.StringField({
        required: true,
        blank: false,
        initial: "flat",
        choices: Object.keys(DASU.itemEffectModes),
      }),
      statusMode: new fields.StringField({
        required: true,
        blank: false,
        initial: "choose",
        choices: Object.keys(DASU.itemStatusModes),
      }),
    });

    schema.price = new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 });

    return schema;
  }
}
