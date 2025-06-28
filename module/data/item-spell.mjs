import DASUItemBase from './base-item.mjs';

export default class DASUSpell extends DASUItemBase {
  static LOCALIZATION_PREFIXES = ['DASU.Item.base', 'DASU.Item.Spell'];

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    schema.spellLevel = new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 1,
      min: 0,
      max: 9,
    });

    return schema;
  }
}
