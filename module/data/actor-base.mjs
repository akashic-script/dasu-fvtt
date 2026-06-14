export default class DASUActorBase extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = {};

    schema.health = new fields.SchemaField({
      value: new fields.NumberField({ ...requiredInteger, initial: 10, min: 0 }),
      max: new fields.NumberField({ ...requiredInteger, initial: 10 }),
    });
    schema.power = new fields.SchemaField({
      value: new fields.NumberField({ ...requiredInteger, initial: 5, min: 0 }),
      max: new fields.NumberField({ ...requiredInteger, initial: 5 }),
    });
    schema.biography = new fields.StringField({ required: true, blank: true });
    schema.level = new fields.NumberField({ ...requiredInteger, initial: 1, min: 0 });

    schema.stats = new fields.SchemaField({
      avoid: new fields.SchemaField({ bonus: new fields.NumberField({ ...requiredInteger, initial: 0 }) }),
      defense: new fields.SchemaField({ bonus: new fields.NumberField({ ...requiredInteger, initial: 0 }) }),
      hit: new fields.SchemaField({ bonus: new fields.NumberField({ ...requiredInteger, initial: 0 }) }),
      land: new fields.SchemaField({ bonus: new fields.NumberField({ ...requiredInteger, initial: 0 }) }),
    });

    return schema;
  }

  prepareBaseData() {
    super.prepareBaseData();
  }

  /**
   * Derive HP/WP maximums and combat stats from attributes.
   */
  _prepareDerivedStats() {
    const a = this.attributes;
    if (!a) return;
    const pow = a.pow?.value ?? 0;
    const dex = a.dex?.value ?? 0;
    const wil = a.wil?.value ?? 0;
    const sta = a.sta?.value ?? 0;

    this.health.max = (sta + pow) * 10;
    this.power.max = (dex + wil) * 10;
    this.health.value = Math.min(this.health.value, this.health.max);
    this.power.value = Math.min(this.power.value, this.power.max);

    const avoidBase = 11 + Math.floor((dex + sta) / 2);
    const defenseBase = 11 + Math.floor((pow + wil) / 2);
    this.stats.avoid.value = avoidBase + (this.stats.avoid.bonus ?? 0);
    this.stats.defense.value = defenseBase + (this.stats.defense.bonus ?? 0);
    this.stats.hit.value = 0 + (this.stats.hit.bonus ?? 0);
    this.stats.land.value = 0 + (this.stats.land.bonus ?? 0);
  }
}
