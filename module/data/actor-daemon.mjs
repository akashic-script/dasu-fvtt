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
        max: new fields.NumberField({ required: true, initial: 0, min: 0 }),
        spent: new fields.NumberField({ required: true, initial: 0, min: 0 }),
      });

    return {
      ...baseSchema,
      origin: new fields.ArrayField(new fields.StringField(), {
        required: false,
      }),
      archetypes: new fields.SchemaField({
        id: new fields.StringField({ required: false }),
        name: new fields.StringField({ required: false }),
        category: new fields.StringField({ required: false }),
        description: new fields.StringField({ required: false }),
        benefits: new fields.StringField({ required: false }),
      }),
      subtypes: new fields.SchemaField({
        id: new fields.StringField({ required: false }),
        name: new fields.StringField({ required: false }),
        category: new fields.StringField({ required: false }),
        description: new fields.StringField({ required: false }),
        benefits: new fields.StringField({ required: false }),
      }),
      roles: new fields.ArrayField(
        new fields.SchemaField({
          id: new fields.StringField({ required: false }),
          name: new fields.StringField({ required: false }),
          category: new fields.StringField({ required: false }),
          description: new fields.StringField({ required: false }),
        })
      ),
      statuses: new fields.SchemaField(
        {
          id: new fields.StringField({ required: true }),
          name: new fields.StringField({ required: true }),
          category: new fields.StringField({ required: true }),
          description: new fields.StringField({ required: false }),
          isNegotiation: new fields.BooleanField({
            required: false,
            initial: false,
          }),
        },
        { required: false }
      ),
      hp: createStatSchema(),
      wp: createStatSchema(),
    };
  }

  prepareDerivedData() {
    this.xp = this.cr * this.cr * 100;
  }
}
