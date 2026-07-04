import DASUItemBase from './item-base.mjs';

export default class DASUBond extends DASUItemBase {
  static RANK_KEYS = ['rank1', 'rank2', 'rank3'];

  static #rankField() {
    const fields = foundry.data.fields;
    return new fields.SchemaField({
      name: new fields.StringField({ required: true, blank: true }),
      threshold: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      abilityType: new fields.StringField({
        required: true,
        blank: false,
        initial: 'passive',
        choices: {
          active: 'DASU.Bond.Ability.Active',
          passive: 'DASU.Bond.Ability.Passive',
          reactive: 'DASU.Bond.Ability.Reactive',
        },
      }),
      effectUuid: new fields.StringField({ required: true, blank: true }),
    });
  }

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    schema.targetUuid = new fields.StringField({ required: true, blank: true });
    schema.targetName = new fields.StringField({ required: true, blank: true });
    schema.affinity = new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 });
    schema.negative = new fields.BooleanField({ initial: false });

    for (const key of this.RANK_KEYS) schema[key] = this.#rankField();

    return schema;
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    let actor = null;
    try {
      if (this.targetUuid) actor = fromUuidSync(this.targetUuid);
    } catch {
      actor = null;
    }
    this.resolvedTargetName = actor?.name ?? this.targetName;
    this.currentRank =
      DASUBond.RANK_KEYS.map((key) => this[key])
        .filter((r) => this.affinity >= r.threshold)
        .at(-1) ?? null;
  }
}
