import DASUItemBase from './item-base.mjs';

export default class DASUSubtype extends DASUItemBase {
  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    schema.identifier = new fields.StringField({ required: true, blank: true });
    schema.statAllocationBonus = new fields.NumberField({
      ...requiredInteger,
      initial: 0,
      min: 0,
    });
    schema.maxAbilitySlots = new fields.NumberField({
      ...requiredInteger,
      initial: 6,
      min: 0,
    });
    schema.maxTacticSlots = new fields.NumberField({
      ...requiredInteger,
      initial: 6,
      min: 0,
    });

    return schema;
  }
}
