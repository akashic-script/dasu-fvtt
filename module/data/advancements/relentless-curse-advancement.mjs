import BaseAdvancement from './base-advancement.mjs';

/**
 * A Relentless Curse: the Dejection equivalent of a class Advancement. Each curse
 * is keyed to a Dejection threshold and authors its own stat penalties; when
 * `grantsScar` is set it also opens a fill-slot for a Scar item at that level.
 */
export default class RelentlessCurseAdvancement extends BaseAdvancement {
  static get TYPE() {
    return 'relentlessCurse';
  }

  static LABEL = 'DASU.Dejection.Curse.Label';
  static ICON = 'fa-solid fa-skull';

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    // The inherited `level` field is the Dejection threshold (1-15) at/above
    // which these penalties apply.
    schema.wpMaxPct = new fields.NumberField({ required: true, integer: true, initial: 0, min: 0, max: 100 });
    schema.wpMaxFlat = new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 });
    schema.avoid = new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 });
    schema.hit = new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 });
    schema.crit = new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 });

    // When true this curse opens a Scar fill-slot at its dejection level.
    schema.grantsScar = new fields.BooleanField({ initial: false });

    return schema;
  }

  /** Scar-granting curses behave as fill-slots for a `scar` item. */
  get isFillSlot() {
    return this.grantsScar;
  }

  get itemType() {
    return this.grantsScar ? 'scar' : '';
  }

  getBadges() {
    const badges = [];
    const p = [];
    if (this.wpMaxPct) p.push(`-${this.wpMaxPct}% WP`);
    if (this.wpMaxFlat) p.push(`-${this.wpMaxFlat} WP`);
    if (this.avoid) p.push(`-${this.avoid} AVO`);
    if (this.hit) p.push(`-${this.hit} HIT`);
    if (this.crit) p.push(`-${this.crit} CRIT`);
    if (p.length) badges.push({ label: p.join(', '), type: 'dejection' });
    if (this.grantsScar) badges.push({ label: game.i18n.localize('TYPES.Item.scar'), type: 'scar' });
    return badges;
  }

  getExpandData() {
    return {
      level: this.level,
      wpMaxPct: this.wpMaxPct,
      wpMaxFlat: this.wpMaxFlat,
      avoid: this.avoid,
      hit: this.hit,
      crit: this.crit,
      grantsScar: this.grantsScar,
    };
  }
}
