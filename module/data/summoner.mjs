import DASUActorBase from "./actor-base.mjs";

export default class DASUSummoner extends DASUActorBase {

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

    schema.skills = new fields.ObjectField({
      required: true,
      initial: () => {
        const init = {};
        for (const key of Object.keys(CONFIG.DASU.skills))
          init[key] = { value: 0, customName: '' };
        return init;
      },
    });

    return schema;
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

    const cls = this.parent?.itemTypes?.class?.[0] ?? null;
    const apMax = cls ? cls.system.apMax(this.level) : Math.floor((this.level + 1) / 2) + 1;
    const apSpent = Object.values(this.attributes).reduce((sum, a) => sum + a.value, 0) - 4;
    this.ap = { max: apMax, spent: apSpent, value: apMax - apSpent };

    for (const key of Object.keys(CONFIG.DASU.skills)) {
      if (!this.skills[key]) this.skills[key] = { value: 0, customName: '' };
    }

    for (const [key, s] of Object.entries(this.skills ?? {})) {
      const i18nKey = CONFIG.DASU.skills[key];
      const defaultLabel = i18nKey ? game.i18n.localize(i18nKey) : key;
      s.label = s.customName?.trim() || defaultLabel;
      s.isCustom = !i18nKey;
    }

    const spMax = cls ? cls.system.spMax(this.level) : 3 + (this.level - 1) * 2;
    const triCost = (r) => (r * (r + 1)) / 2;
    const spSpent = Object.values(this.skills ?? {}).reduce((sum, s) => sum + triCost(s.value ?? 0), 0);
    this.sp = { max: spMax, spent: spSpent, value: spMax - spSpent };
  }

  getRollData() {
    const data = {};
    if (this.attributes) {
      data.attributes = {};
      for (let [k, v] of Object.entries(this.attributes))
        data.attributes[k] = foundry.utils.deepClone(v);
    }
    if (this.skills) {
      data.skills = {};
      for (let [k, v] of Object.entries(this.skills))
        data.skills[k] = foundry.utils.deepClone(v);
    }
    data.lvl = this.level;
    data.ap = foundry.utils.deepClone(this.ap);
    data.sp = foundry.utils.deepClone(this.sp);
    data.stats = foundry.utils.deepClone(this.stats);
    return data;
  }
}
