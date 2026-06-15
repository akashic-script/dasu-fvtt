import DASUItemBase from "./item-base.mjs";
import { DamageField } from "./fields/damage-field.mjs";
import { DASU } from "../helpers/config.mjs";

export default class DASUWeapon extends DASUItemBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    schema.category = new fields.StringField({
      required: true,
      blank: false,
      initial: "small",
      choices: Object.keys(DASU.weaponCategories),
    });

    schema.range = new fields.StringField({
      required: true,
      blank: false,
      initial: "melee",
      choices: Object.keys(DASU.weaponRanges),
    });

    schema.damage = DamageField();
    schema.toHit = new fields.NumberField({ ...requiredInteger, initial: 0 });
    schema.price = new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 });

    return schema;
  }
}
