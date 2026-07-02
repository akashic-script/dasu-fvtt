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

    // Will Strain cost this daemon imposes on its summoner when fielded.
    // Derived from level (see prepareDerivedData); the bonus is an AE hook.
    schema.strain = new fields.SchemaField({
      bonus: new fields.NumberField({ ...requiredInteger, initial: 0 }),
    });

    // Descriptive combat Roles (fighter, magus, ...). No mechanical effect;
    // a daemon may have several. Validated against CONFIG.DASU.daemonRoles.
    schema.roles = new fields.ArrayField(new fields.StringField(), {
      required: true,
      initial: [],
    });

    schema.transformations = new fields.ArrayField(
      new fields.SchemaField({
        uuid: new fields.StringField({ required: true, blank: false }),
        meritThreshold: new fields.NumberField({
          required: true,
          integer: true,
          initial: 0,
          min: 0,
        }),
      }),
      { required: true, initial: [] }
    );

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

  // Resolve transformation entries to display rows (target name/img + reached).
  _prepareTransformations() {
    const entries = this._source.transformations ?? this.transformations ?? [];
    this.transformationRows = entries.map((entry, index) => {
      let actor = null;
      try {
        if (entry.uuid) actor = fromUuidSync(entry.uuid);
      } catch {
        actor = null;
      }
      return {
        index,
        uuid: entry.uuid,
        meritThreshold: entry.meritThreshold ?? 0,
        name: actor?.name ?? entry.uuid,
        img: actor?.img ?? 'icons/svg/mystery-man.svg',
        missing: !actor,
        reached: this.merit >= (entry.meritThreshold ?? 0),
      };
    });
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    this._prepareTransformations();

    // Drop any stored role keys that aren't in the config (stale/invalid).
    const roleKeys = Object.keys(CONFIG.DASU.daemonRoles ?? {});
    this.roles = (this.roles ?? []).filter((r) => roleKeys.includes(r));
    if (!this.attributes) return;
    for (const key in this.attributes) {
      if (!this.attributes[key]) continue;
      this.attributes[key].label = game.i18n.localize(CONFIG.DASU.attributes[key]) ?? key;
      this.attributes[key].abbr = game.i18n.localize(CONFIG.DASU.attributeAbbreviations[key]) ?? key;
    }

    this._prepareDerivedStats();

    // Will Strain cost = max(2, ceil(Lvl / 5)), plus any AE bonus.
    this.strain.value = Math.max(2, Math.ceil(this.level / 5)) + (this.strain.bonus ?? 0);

    // AP pool.
    const subtype = this.parent?.itemTypes?.subtype?.[0]?.system;
    const oddLevels = Math.floor((this.level + 1) / 2);
    const apMax = oddLevels + 1 + (subtype?.statAllocationBonus ?? 0);
    const apSpent = Object.values(this.attributes).reduce((sum, a) => sum + a.value, 0) - 4;
    this.ap = { max: apMax, spent: apSpent, value: apMax - apSpent };

    // Ability/tactic slot capacity, capped by the daemon's subtype.
    this.slots = {
      ability: {
        max: subtype?.maxAbilitySlots ?? null,
        used: this.parent?.itemTypes?.ability?.length ?? 0,
      },
      tactic: {
        max: subtype?.maxTacticSlots ?? null,
        used: this.parent?.itemTypes?.tactic?.length ?? 0,
      },
    };

    this._applyArchetypeBonuses();
  }

  /**
   * Apply the daemon's archetype bonuses. Each bonus is a Roll formula resolved
   * against this actor's roll data and added to a derived stat path. 
   * All math lives on the archetype item; nothing is hardcoded here.
   */
  _applyArchetypeBonuses() {
    const archetype = this.parent?.itemTypes?.archetype?.[0];
    const bonuses = archetype?.system.bonuses;
    if (!bonuses?.length) return;

    const rollData = this.getRollData();
    for (const { target, formula } of bonuses) {
      if (!target || !formula?.trim()) continue;
      let value;
      try {
        value = Roll.safeEval(Roll.replaceFormulaData(formula, rollData));
      } catch (err) {
        console.warn(`DASU | Archetype bonus formula failed: "${formula}"`, err);
        continue;
      }
      if (!Number.isFinite(value)) continue;
      const current = foundry.utils.getProperty(this, target) ?? 0;
      foundry.utils.setProperty(this, target, current + value);
    }

    this.resources.hp.value = Math.min(this.resources.hp.value, this.resources.hp.max);
    this.resources.wp.value = Math.min(this.resources.wp.value, this.resources.wp.max);
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
    data.strain = foundry.utils.deepClone(this.strain);
    return data;
  }
}
