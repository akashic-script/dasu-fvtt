import DASUItemBase from './item-base.mjs';

export default class DASUArchetype extends DASUItemBase {
  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    schema.bonuses = new fields.ArrayField(
      new fields.SchemaField({
        target: new fields.StringField({
          required: true,
          blank: false,
          initial: 'resources.hp.max',
        }),
        formula: new fields.StringField({
          required: true,
          blank: true,
          initial: '',
        }),
      })
    );

    return schema;
  }
}
