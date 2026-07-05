import DASUItemBase from "./item-base.mjs";
import { DamageField, ResourceField } from "./fields/index.mjs";
import { DASU } from "../helpers/config.mjs";
import { TaggableMixin } from "./mixins/taggable.mjs";

export default class DASUWeapon extends TaggableMixin(DASUItemBase) {

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    schema.category = new fields.StringField({
      required: true,
      blank: false,
      initial: "small",
      choices: DASU.weaponCategories,
    });

    schema.range = new fields.StringField({
      required: true,
      blank: false,
      initial: "melee",
      choices: DASU.weaponRanges,
    });

    schema.govern = new fields.StringField({
      required: true,
      blank: false,
      initial: "pow",
      choices: DASU.attributes,
    });

    schema.damage = DamageField();
    schema.toHit = new fields.NumberField({ ...requiredInteger, initial: 0 });
    schema.resource = ResourceField();

    return schema;
  }

  get isEquipped() {
    const item = this.parent;
    return item?.actor?.system?.equipped?.isEquipped(item) ?? false;
  }

  transferEffects() {
    return this.isEquipped;
  }
}
