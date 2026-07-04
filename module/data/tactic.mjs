import DASUItemBase from "./item-base.mjs";
import { DamageField, ResourceField } from "./fields/index.mjs";
import { DASU } from "../helpers/config.mjs";
import { TaggableMixin } from "./mixins/taggable.mjs";

export default class DASUTactic extends TaggableMixin(DASUItemBase) {

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    schema.govern = new fields.StringField({
      required: true,
      blank: false,
      initial: "none",
      choices: { none: "DASU.Item.Tactic.GovernNone", ...DASU.attributes },
    });

    // Tactic damage always targets WP and never runs through the damage pipeline.
    schema.damage = DamageField({
      initial: { value: 0, type: 'untyped', resource: 'wp' },
    });
    schema.resource = ResourceField({ defaultType: 'wp' });
    schema.toLand = new fields.NumberField({ ...requiredInteger, initial: 0 });
    schema.isInfinity = new fields.BooleanField({ required: true, initial: false });

    return schema;
  }

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
    if (this.isInfinity) {
      this.toLand = 0;
    }
  }
}
