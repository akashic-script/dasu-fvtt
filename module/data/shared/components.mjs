import { ResistancesDataModel } from '../actors/resistances-data-model.mjs';

export class SharedActorComponents {
  static getAttributesSchema() {
    const fields = foundry.data.fields;
    return new fields.SchemaField({
      pow: new fields.SchemaField({
        tick: new fields.NumberField({
          required: true,
          initial: 1,
          min: 1,
          max: 6,
        }),
      }),
      dex: new fields.SchemaField({
        tick: new fields.NumberField({
          required: true,
          initial: 1,
          min: 1,
          max: 6,
        }),
      }),
      will: new fields.SchemaField({
        tick: new fields.NumberField({
          required: true,
          initial: 1,
          min: 1,
          max: 6,
        }),
      }),
      sta: new fields.SchemaField({
        tick: new fields.NumberField({
          required: true,
          initial: 1,
          min: 1,
          max: 6,
        }),
      }),
    });
  }

  static getStatsSchema() {
    const fields = foundry.data.fields;

    // Create a function to generate a new stat schema instance
    const createStatSchema = () =>
      new fields.SchemaField({
        mod: new fields.NumberField({ required: true, initial: 0 }),
        multiplier: new fields.NumberField({ required: true, initial: 1 }),
      });

    // Create a function for hp/wp with current and temp
    const createResourceStatSchema = () =>
      new fields.SchemaField({
        mod: new fields.NumberField({ required: true, initial: 0 }),
        multiplier: new fields.NumberField({ required: true, initial: 1 }),
        current: new fields.NumberField({ required: true, initial: 0, min: 0 }),
        temp: new fields.NumberField({ required: true, initial: 0, min: 0 }),
      });

    // Create a function for crit with specific mod range
    const createCritStatSchema = () =>
      new fields.SchemaField({
        mod: new fields.NumberField({
          required: true,
          initial: 0,
          min: 0,
          max: 6,
        }),
        multiplier: new fields.NumberField({ required: true, initial: 1 }),
      });

    return new fields.SchemaField({
      hp: createResourceStatSchema(),
      wp: createResourceStatSchema(),
      avoid: createStatSchema(),
      def: createStatSchema(),
      toHit: createStatSchema(),
      toLand: createStatSchema(),
      willStrain: createStatSchema(),
      crit: createCritStatSchema(),
    });
  }

  static getResistancesSchema() {
    const fields = foundry.data.fields;
    return new fields.EmbeddedDataField(ResistancesDataModel, {});
  }

  static getAptitudesSchema() {
    const fields = foundry.data.fields;

    // Create a function to generate a new aptitude field instance
    const createAptitudeField = () =>
      new fields.NumberField({
        required: true,
        initial: 0,
        min: 0,
        max: 10,
      });

    return new fields.SchemaField({
      f: createAptitudeField(),
      i: createAptitudeField(),
      el: createAptitudeField(),
      w: createAptitudeField(),
      ea: createAptitudeField(),
      l: createAptitudeField(),
      d: createAptitudeField(),
      dp: createAptitudeField(),
      dm: createAptitudeField(),
      da: createAptitudeField(),
      h: createAptitudeField(),
      tb: createAptitudeField(),
      tt: createAptitudeField(),
      tg: createAptitudeField(),
      ta: createAptitudeField(),
      assist: createAptitudeField(),
    });
  }

  static prepareDerivedResources(system) {
    // Defensive: ensure all required fields exist
    const pow = system.attributes?.pow?.tick ?? 0;
    const dex = system.attributes?.dex?.tick ?? 0;
    const will = system.attributes?.will?.tick ?? 0;
    const sta = system.attributes?.sta?.tick ?? 0;
    const hpMod = system.stats?.hp?.mod ?? 0;
    const wpMod = system.stats?.wp?.mod ?? 0;
    const avoidMod = system.stats?.avoid?.mod ?? 0;
    const defMod = system.stats?.def?.mod ?? 0;
    const critMod = system.stats?.crit?.mod ?? 0;

    // HP: (Stamina + Power) * 10 + HP mod
    system.stats = system.stats || {};
    system.stats.hp = system.stats.hp || {};
    Object.defineProperty(system.stats.hp, 'max', {
      configurable: true,
      enumerable: true,
      get() {
        return (sta + pow) * 10 + hpMod;
      },
    });

    // WP: (Dexterity + Willpower) * 10 + WP mod
    system.stats.wp = system.stats.wp || {};
    Object.defineProperty(system.stats.wp, 'max', {
      configurable: true,
      enumerable: true,
      get() {
        return (dex + will) * 10 + wpMod;
      },
    });

    // Avoid (AVD): 7 + ([DEX + STA] / 2) + Avoid mod
    system.stats.avoid = system.stats.avoid || {};
    Object.defineProperty(system.stats.avoid, 'value', {
      configurable: true,
      enumerable: true,
      get() {
        return 7 + Math.floor((dex + sta) / 2) + avoidMod;
      },
    });

    // Defense (DEF): 7 + ([POW + WILL] / 2) + Defense mod
    system.stats.def = system.stats.def || {};
    Object.defineProperty(system.stats.def, 'value', {
      configurable: true,
      enumerable: true,
      get() {
        return 7 + Math.floor((pow + will) / 2) + defMod;
      },
    });

    // Crit: Threshold starts at 7, reduced by crit mod (dejections), min 2, max 7
    system.stats.crit = system.stats.crit || {};
    Object.defineProperty(system.stats.crit, 'value', {
      configurable: true,
      enumerable: true,
      get() {
        return Math.max(2, Math.min(7, 7 - critMod));
      },
    });
  }
}
