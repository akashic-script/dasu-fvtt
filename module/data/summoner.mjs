import DASUActorBase from "./actor-base.mjs";

export default class DASUSummoner extends DASUActorBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    schema.attributes = new fields.SchemaField({
      level: new fields.SchemaField({
        value: new fields.NumberField({ ...requiredInteger, initial: 1 })
      }),
    });

    const abilityKeys = Object.keys(CONFIG.DASU.abilities);
    const abilitiesSchema = {};
    for (const ability of abilityKeys) {
      abilitiesSchema[ability] = new fields.SchemaField({
        value: new fields.NumberField({ ...requiredInteger, initial: 1, min: 0, max: 6 }),
        label: new fields.StringField({ required: true, blank: true })
      });
    }
    schema.abilities = new fields.SchemaField(abilitiesSchema);

    return schema;
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    if (!this.abilities) return;
    for (const key in this.abilities) {
      if (!this.abilities[key]) continue;
      this.abilities[key].label = game.i18n.localize(CONFIG.DASU.abilities[key]) ?? key;
      this.abilities[key].abbr = game.i18n.localize(CONFIG.DASU.abilityAbbreviations[key]) ?? key;
    }
  }

  getRollData() {
    const data = {};

    if (this.abilities) {
      data.abilities = {};
      for (let [k, v] of Object.entries(this.abilities)) {
        data.abilities[k] = foundry.utils.deepClone(v);
      }
    }

    data.lvl = this.attributes.level.value;

    return data;
  }
}
