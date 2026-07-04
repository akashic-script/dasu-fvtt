import DASUItemBase from './item-base.mjs';

export default class DASUSpecialAbility extends DASUItemBase {
  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    schema.kind = new fields.StringField({
      required: true,
      blank: false,
      initial: 'passive',
      choices: {
        passive: 'DASU.SpecialAbility.Kind.Passive',
        active: 'DASU.SpecialAbility.Kind.Active',
        reactive: 'DASU.SpecialAbility.Kind.Reactive',
      },
    });

    return schema;
  }
}
