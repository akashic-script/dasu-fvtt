import { SharedActorComponents } from '../shared/components.mjs';

export default class BaseActorDataModel extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ['DASU.Actor.base'];

  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      dsid: new fields.StringField({
        required: false,
        blank: true,
        initial: '',
      }),
      publishId: new fields.StringField({ required: false }),
      level: new fields.NumberField({
        required: true,
        initial: 1,
        min: 1,
        get max() {
          return game.settings.get('dasu', 'maxLevel') || 30;
        },
        integer: true,
      }),
      merit: new fields.NumberField({
        required: true,
        initial: 0,
        min: 0,
        integer: true,
      }),
      attributes: SharedActorComponents.getAttributesSchema(),
      stats: SharedActorComponents.getStatsSchema(),
      resistances: SharedActorComponents.getResistancesSchema(),
      aptitudes: SharedActorComponents.getAptitudesSchema(),
      biography: new fields.HTMLField({
        required: false,
        initial: '',
      }),
      triad: new fields.SchemaField({
        virtue: new fields.StringField({
          required: false,
          initial: '',
          blank: true,
        }),
        sin: new fields.StringField({
          required: false,
          initial: '',
          blank: true,
        }),
        anathema: new fields.StringField({
          required: false,
          initial: '',
          blank: true,
        }),
      }),
      equipped: new fields.SchemaField({
        weapon: new fields.StringField({
          required: false,
          initial: null,
          nullable: true,
          blank: true,
        }),
      }),
    };
  }

  /**
   * Provide roll data for formulas
   * Includes shorthand attribute tick values (@str, @dex, @pow, @will, etc.)
   * @returns {Object} Roll data object
   */
  getRollData() {
    const data = { ...this };

    // Add shorthand attribute tick values for formulas
    if (this.attributes) {
      for (const [key, attr] of Object.entries(this.attributes)) {
        data[key] = attr.tick ?? 0;
      }
    }

    return data;
  }
}
