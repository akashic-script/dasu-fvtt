import DASUActorBase from "./actor-base.mjs";

export default class DASUDaemon extends DASUActorBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    const attributeKeys = Object.keys(CONFIG.DASU.attributes);
    const attributesSchema = {};
    for (const attribute of attributeKeys) {
      attributesSchema[attribute] = new fields.SchemaField({
        value: new fields.NumberField({ ...requiredInteger, initial: 1, min: 0, max: 6 }),
        label: new fields.StringField({ required: true, blank: true })
      });
    }
    schema.attributes = new fields.SchemaField(attributesSchema);

    return schema;
  }

  // Daemons don't level up; they collect Merits to Transform at a per-entry
  // threshold.
  // TODO: replace the placeholder threshold with per-daemon-entry transform data.
  _prepareMeritProgress() {
    const threshold = CONFIG.DASU.daemonTransformMerits ?? 100;
    const toNext = Math.max(0, threshold - this.merit);
    this.meritProgress = {
      mode: 'transform',
      atMax: false,
      toNext,
      needed: threshold,
      nextLevel: null,
      canAdvance: toNext === 0,
    };
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    if (!this.attributes) return;
    for (const key in this.attributes) {
      if (!this.attributes[key]) continue;
      this.attributes[key].label = game.i18n.localize(CONFIG.DASU.attributes[key]) ?? key;
      this.attributes[key].abbr = game.i18n.localize(CONFIG.DASU.attributeAbbreviations[key]) ?? key;
    }

    this._prepareDerivedStats();

    // AP pool
    const oddLevels = Math.floor((this.level + 1) / 2);
    const apMax = oddLevels + 1;
    const apSpent = Object.values(this.attributes).reduce((sum, a) => sum + a.value, 0) - 4;
    this.ap = { max: apMax, spent: apSpent, value: apMax - apSpent };
  }

  getRollData() {
    const data = {};
    if (this.attributes) {
      data.attributes = {};
      for (let [k, v] of Object.entries(this.attributes)) {
        data.attributes[k] = foundry.utils.deepClone(v);
      }
    }
    data.lvl = this.level;
    data.ap = foundry.utils.deepClone(this.ap);
    data.stats = foundry.utils.deepClone(this.stats);
    return data;
  }
}
