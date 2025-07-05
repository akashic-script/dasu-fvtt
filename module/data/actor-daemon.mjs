import BaseActorDataModel from './base-actor.mjs';

export default class DaemonDataModel extends BaseActorDataModel {
  static LOCALIZATION_PREFIXES = [
    ...super.LOCALIZATION_PREFIXES,
    'DASU.Actor.Daemon',
  ];

  static defineSchema() {
    const fields = foundry.data.fields;
    const baseSchema = super.defineSchema();

    const createStatSchema = () =>
      new fields.SchemaField({
        current: new fields.NumberField({ required: true, initial: 0, min: 0 }),
        spent: new fields.NumberField({ required: true, initial: 0, min: 0 }),
      });

    return {
      ...baseSchema,
      origin: new fields.ArrayField(new fields.StringField(), {
        required: false,
      }),
      archetypes: new fields.SchemaField({
        name: new fields.StringField({ required: false }),
        description: new fields.StringField({ required: false }),
        benefits: new fields.StringField({ required: false }),
      }),
      subtypes: new fields.SchemaField({
        name: new fields.StringField({ required: false }),
        description: new fields.StringField({ required: false }),
        benefits: new fields.StringField({ required: false }),
      }),
      roles: new fields.ArrayField(
        new fields.SchemaField({
          name: new fields.StringField({ required: false }),
          description: new fields.StringField({ required: false }),
        })
      ),
      hp: createStatSchema(),
      wp: createStatSchema(),
    };
  }

  prepareDerivedData() {}

  /**
   * Prepare daemon-specific data (placeholder)
   * @param {Array} items - Actor's items for filtering
   */
  prepareDaemonData(items = []) {
    // TODO: Implement daemon-specific data preparation logic here
    // Example: filter items, calculate derived stats, etc.
    // This is a placeholder for future daemon logic.
    return {};
  }
}
