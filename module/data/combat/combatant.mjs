/**
 * Participation data for a DASU {@link Combatant}.
 *
 * Turn order is team-based: a summoner and its fielded daemons share one
 * initiative, so only summoners and NPCs get a combatant. Which daemons are
 * fielded is read live from the actor's stock, not stored here.
 */
export default class DASUCombatantData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredBoolean = { required: true, nullable: false };
    const schema = {};

    // The `daemon` role is only for a standalone daemon combatant; fielded
    // daemons ride the summoner and have no combatant of their own.
    schema.role = new fields.StringField({
      required: true,
      blank: false,
      initial: 'npc',
      choices: {
        summoner: 'DASU.Combat.Role.Summoner',
        daemon: 'DASU.Combat.Role.Daemon',
        npc: 'DASU.Combat.Role.NPC',
      },
    });

    // Per-round action economy; `spent` resets each turn.
    const actionField = () =>
      new fields.SchemaField({
        max: new fields.NumberField({
          required: true,
          nullable: false,
          integer: true,
          initial: 1,
          min: 0,
        }),
        spent: new fields.NumberField({
          required: true,
          nullable: false,
          integer: true,
          initial: 0,
          min: 0,
        }),
      });

    schema.actions = new fields.SchemaField({
      major: actionField(),
      minor: actionField(),
      // Free actions are effectively unbounded; tracked for display/analytics.
      free: new fields.SchemaField({
        spent: new fields.NumberField({
          required: true,
          nullable: false,
          integer: true,
          initial: 0,
          min: 0,
        }),
      }),
    });

    // Pre-combat UI hint (staged into the field); not authoritative for turn order.
    schema.staged = new fields.BooleanField({ ...requiredBoolean, initial: false });

    return schema;
  }
}
