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

    // Accumulated Dejection (0-15). Drives Will-damage penalties via the
    // summoner's Dejection item's Relentless Curses; 15 = Perish.
    schema.dejection = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0, max: 15 });

    schema.stock = new fields.ArrayField(
      new fields.SchemaField({
        uuid: new fields.StringField({ required: true, blank: false }),
        active: new fields.BooleanField({ initial: false }),
        // Channelers may channel one daemon as a separate layer; it does not
        // count toward Will Strain like fielded (active) daemons do.
        channeled: new fields.BooleanField({ initial: false }),
      }),
      { required: true, initial: [] }
    );

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
    this._applyDejection();

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
      // Normalize specialties to an array of { name } entries.
      s.specialties = (Array.isArray(s.specialties) ? s.specialties : [])
        .map((sp) => (typeof sp === 'string' ? { name: sp } : { name: sp?.name ?? '' }))
        .filter((sp) => sp.name.trim());
    }

    // Specialty budget: 3 to start, +1 every 9 levels. Derived, not a cap on storage.
    const specialtiesUsed = Object.values(this.skills ?? {}).reduce(
      (sum, s) => sum + (s.specialties?.length ?? 0),
      0
    );
    this.specialties = {
      max: 3 + Math.floor(this.level / 9),
      used: specialtiesUsed,
    };

    const spMax = cls ? cls.system.spMax(this.level) : 3 + (this.level - 1) * 2;
    const triCost = (r) => (r * (r + 1)) / 2;
    const spSpent = Object.values(this.skills ?? {}).reduce((sum, s) => sum + triCost(s.value ?? 0), 0);
    this.sp = { max: spMax, spent: spSpent, value: spMax - spSpent };

    // Will Strain Cap = base WILL tick x party multiplier. Uses the source value
    // so WILL-reducing status effects (e.g. Despair) never lower the cap.
    const baseWil = this.parent?._source?.system?.attributes?.wil?.value ?? this.attributes.wil?.value ?? 0;
    this.willStrain = {
      cap: baseWil * (CONFIG.DASU.willStrainMultiplier ?? 2),
    };

    // Channelers may channel one daemon as a layer separate from fielded stock.
    // dsid may be stored or derived-from-name; fall back to the class name.
    const classDsid =
      cls?.system?.dsid ||
      cls?._source?.system?.dsid ||
      (cls?.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    this.isChanneler = classDsid === 'channeler';
  }

  /**
   * Apply Dejection's Will-damage penalties to derived stats. Penalty values are
   * authored per Relentless Curse on the Dejection item, summed across all
   * curses active at the current dejection track. Runs after _prepareDerivedStats.
   */
  _applyDejection() {
    const dejection = this.dejection ?? 0;
    const dej = this.parent?.itemTypes?.dejection?.[0] ?? null;
    const penalties = dej?.system?.penaltiesAt
      ? dej.system.penaltiesAt(dejection)
      : { wpMaxPct: 0, wpMaxFlat: 0, avoid: 0, hit: 0, crit: 0 };

    // Max WP: flat first, then percentage of the (already flat-reduced) max.
    const wpMax0 = this.resources.wp.max;
    let wpMax = wpMax0 - penalties.wpMaxFlat;
    if (penalties.wpMaxPct) wpMax -= Math.floor((wpMax * penalties.wpMaxPct) / 100);
    this.resources.wp.max = Math.max(0, wpMax);
    this.resources.wp.value = Math.min(this.resources.wp.value, this.resources.wp.max);

    // Avoid / To Hit reductions.
    this.stats.avoid.value = Math.max(0, this.stats.avoid.value - penalties.avoid);
    this.stats.hit.value -= penalties.hit;

    // Critical Threshold reduction, combined-capped (Dejection+Killer+Hatred)
    // and never below the floor. Killer/Hatred reductions are added here when
    // those subsystems land; for now Dejection is the only contributor.
    const floor = CONFIG.DASU.check?.minCritThreshold ?? 2;
    const cap = CONFIG.DASU.critReductionCap ?? 10;
    const critReduction = Math.min(cap, penalties.crit);
    this.stats.critical.value = Math.max(floor, this.stats.critical.value - critReduction);

    // Surfaced for the sheet (penalty summary, Perish state).
    this.dejectionEffects = penalties;
    this.perished = dejection >= 15;
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
