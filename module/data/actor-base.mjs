export default class DASUActorBase extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = {};

    schema.resources = new fields.SchemaField({
      hp: new fields.SchemaField({
        value: new fields.NumberField({ ...requiredInteger, initial: 10, min: 0 }),
        bonus: new fields.NumberField({ ...requiredInteger, initial: 0 }),
      }),
      wp: new fields.SchemaField({
        value: new fields.NumberField({ ...requiredInteger, initial: 5, min: 0 }),
        bonus: new fields.NumberField({ ...requiredInteger, initial: 0 }),
      }),
    });
    schema.biography = new fields.StringField({ required: true, blank: true });
    schema.notes = new fields.StringField({ required: true, blank: true });
    schema.level = new fields.NumberField({ ...requiredInteger, initial: 1, min: 0 });
    schema.merit = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });
    schema.riches = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });

    schema.triad = new fields.SchemaField({
      virtue:   new fields.StringField({ required: true, blank: true }),
      sin:      new fields.StringField({ required: true, blank: true }),
      anathema: new fields.StringField({ required: true, blank: true }),
    });

    const resistanceField = () => new fields.SchemaField({
      base: new fields.NumberField({ ...requiredInteger, initial: 0, min: -1, max: 3 }),
    });

    schema.resistances = new fields.SchemaField({
      physical: resistanceField(),
      fire:     resistanceField(),
      ice:      resistanceField(),
      electric: resistanceField(),
      wind:     resistanceField(),
      earth:    resistanceField(),
      light:    resistanceField(),
      dark:     resistanceField(),
    });

    schema.aptitudes = new fields.ObjectField({
      required: true,
      initial: () => {
        const init = {};
        for (const key of Object.keys(CONFIG.DASU.aptitudes))
          init[key] = { bonus: 0 };
        return init;
      },
    });

    schema.stats = new fields.SchemaField({
      avoid: new fields.SchemaField({ bonus: new fields.NumberField({ ...requiredInteger, initial: 0 }) }),
      defense: new fields.SchemaField({ bonus: new fields.NumberField({ ...requiredInteger, initial: 0 }) }),
      hit: new fields.SchemaField({ bonus: new fields.NumberField({ ...requiredInteger, initial: 0 }) }),
      land: new fields.SchemaField({ bonus: new fields.NumberField({ ...requiredInteger, initial: 0 }) }),
      critical: new fields.SchemaField({ bonus: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }), value: new fields.NumberField({ ...requiredInteger, initial: 11 }) }),
    });

    return schema;
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    this._prepareMeritProgress();
    this._prepareAptitudes();
  }

  _prepareAptitudes() {
    this.aptitudes ??= {};
    const derived = CONFIG.DASU.derivedAptitudes ?? {};
    const clamp = (n) => Math.max(0, Math.min(4, n));

    // Normalize entries, resolve base values.
    for (const key of Object.keys(CONFIG.DASU.aptitudes)) {
      const apt = (this.aptitudes[key] ??= {});
      apt.bonus ??= 0;
      apt.isDerived = key in derived;
      apt.label = game.i18n.localize(CONFIG.DASU.aptitudes[key]) ?? key;
      apt.abbr = game.i18n.localize(CONFIG.DASU.aptitudeAbbreviations[key]) ?? key;
      if (!apt.isDerived) apt.value = clamp(apt.bonus);
    }

    // Derived aptitudes draw from base values plus their override.
    for (const [key, def] of Object.entries(derived)) {
      const apt = this.aptitudes[key];
      if (!apt) continue;
      if (def.op === 'flag') {
        apt.value = apt.bonus > 0 ? 1 : 0;
        continue;
      }
      const inputs = def.from.map((k) => this.aptitudes[k]?.value ?? 0);
      const composite = def.op === 'max' ? Math.max(...inputs) : Math.min(...inputs);
      apt.value = clamp(composite + apt.bonus);
    }
  }

  // Summoners advance by Level, reaching the next level's cumulative Merit
  // threshold. Daemons override this with Transform progress instead.
  _prepareMeritProgress() {
    const table = CONFIG.DASU.levelMerits ?? {};
    const maxLevel = Math.max(this.level, ...Object.keys(table).map(Number));
    const nextLevel = this.level + 1;
    const nextThreshold = table[nextLevel];
    const atMax = nextThreshold === undefined || this.level >= maxLevel;
    const toNext = atMax ? 0 : Math.max(0, nextThreshold - this.merit);

    this.meritProgress = {
      mode: 'level',
      atMax,
      toNext,
      needed: atMax ? 0 : nextThreshold,
      nextLevel: atMax ? null : nextLevel,
      canAdvance: !atMax && toNext === 0,
    };
  }

  _prepareDerivedStats() {
    const a = this.attributes;
    if (!a) return;
    const pow = a.pow?.value ?? 0;
    const dex = a.dex?.value ?? 0;
    const wil = a.wil?.value ?? 0;
    const sta = a.sta?.value ?? 0;

    this.resources.hp.max = (sta + pow) * 10 + (this.resources.hp.bonus ?? 0);
    this.resources.wp.max = (dex + wil) * 10 + (this.resources.wp.bonus ?? 0);
    this.resources.hp.value = Math.min(this.resources.hp.value, this.resources.hp.max);
    this.resources.wp.value = Math.min(this.resources.wp.value, this.resources.wp.max);

    const avoidBase = 11 + Math.floor((dex + sta) / 2);
    const defenseBase = 11 + Math.floor((pow + wil) / 2);
    this.stats.avoid.value = avoidBase + (this.stats.avoid.bonus ?? 0);
    this.stats.defense.value = defenseBase + (this.stats.defense.bonus ?? 0);
    this.stats.hit.value = 0 + (this.stats.hit.bonus ?? 0);
    this.stats.land.value = 0 + (this.stats.land.bonus ?? 0);
    this.stats.critical.value = Math.max(2, 11 - (this.stats.critical.bonus ?? 0));
  }
}
