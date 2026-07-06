/**
 * Encounter-level data for a DASU {@link Combat}. Adds an encounter `kind` so a
 * single tracker can branch between combat and (future) negotiation. Only the
 * combat path is implemented this branch; `negotiation` is reserved scaffolding.
 */
export default class DASUCombatData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};

    schema.kind = new fields.StringField({
      required: true,
      blank: false,
      initial: 'combat',
      choices: {
        combat: 'DASU.Combat.Kind.Combat',
        negotiation: 'DASU.Combat.Kind.Negotiation',
      },
    });

    return schema;
  }
}
