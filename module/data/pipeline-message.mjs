/**
 * ChatMessage subtype DataModel for pipeline result cards.
 *
 * Replaces the legacy flag-based PipelineState. The message owns its own data
 * and rendering: button visibility and applied/reverted state are derived from
 * `applied` at render time rather than baked into a stored content string.
 *
 * @property {string} type      pipeline type, e.g. 'damage' | 'resource' | 'effect'
 * @property {boolean} applied  whether the mutation is currently applied
 * @property {object} source    { actorUuid, itemUuid, name } provenance
 * @property {object} target    { actorUuid }
 * @property {object} input     editable inputs (amount/type/cost/mode/effectUuid)
 * @property {object} computed  derived values, recomputable from input + target
 * @property {object} revert    data needed to reverse the apply
 */
export default class PipelineMessageModel extends foundry.abstract
  .TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      type: new fields.StringField({ required: true, blank: false }),
      applied: new fields.BooleanField({ initial: true }),
      source: new fields.SchemaField({
        actorUuid: new fields.StringField({ required: true, blank: true }),
        itemUuid: new fields.StringField({ required: true, blank: true }),
        name: new fields.StringField({ required: true, blank: true }),
      }),
      target: new fields.SchemaField({
        actorUuid: new fields.StringField({ required: true, blank: true }),
      }),
      input: new fields.ObjectField(),
      computed: new fields.ObjectField(),
      revert: new fields.ObjectField(),
    };
  }
}
