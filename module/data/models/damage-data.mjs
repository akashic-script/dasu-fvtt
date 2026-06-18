import { DASU } from '../../helpers/config.mjs';

/**
 * A damage block: numeric value + element type.
 */
export default class DamageData extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      value: new fields.NumberField({
        required: true,
        nullable: false,
        integer: true,
        initial: 0,
        min: 0,
      }),
      damageType: new fields.StringField({
        required: true,
        blank: false,
        initial: 'physical',
        choices: DASU.damageTypes,
      }),
    };
  }

  /** Localized label for the damage type. */
  get typeLabel() {
    return game.i18n.localize(DASU.damageTypes[this.damageType] ?? '');
  }
}
