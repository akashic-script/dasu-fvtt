import DASUItemBase from "./item-base.mjs";
import { AptitudeField, DamageField, HealField, ResourceField } from "./fields/index.mjs";
import { DASU } from "../helpers/config.mjs";
import { TaggableMixin } from "./mixins/taggable.mjs";

export default class DASUAbility extends TaggableMixin(DASUItemBase) {

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    schema.category = new fields.StringField({
      required: true,
      blank: false,
      initial: "spell",
      choices: DASU.abilityCategories,
    });

    schema.govern = new fields.StringField({
      required: true,
      blank: false,
      initial: "pow",
      choices: DASU.attributes,
    });

    schema.damage = DamageField();
    schema.heal = HealField();
    schema.resource = ResourceField({ defaultType: 'wp' });
    schema.toHit = new fields.NumberField({ ...requiredInteger, initial: 0 });
    schema.isInfinity = new fields.BooleanField({ required: true, initial: false });
    schema.aptitude = AptitudeField();

    return schema;
  }

  /** Abilities use aptitude level as their tag budget. */
  _tagBudget() {
    return this.aptitude?.value ?? 0;
  }

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
    if (this.isInfinity) {
      this.toHit = 0;
    }
    if (this.aptitude.type === 'assist') {
      this.aptitude.value = 1;
    }
  }
}
