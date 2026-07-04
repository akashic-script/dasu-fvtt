import { DASU } from '../../helpers/config.mjs';

/**
 * A damage block: numeric value, element type, and the resource it reduces.
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
      resource: new fields.StringField({
        required: true,
        blank: false,
        initial: 'hp',
        choices: DASU.damageResources,
      }),
      type: new fields.StringField({
        required: true,
        blank: false,
        initial: 'physical',
        choices: DASU.damageTypes,
      }),
    };
  }

  /** Localized label for the damage type. */
  get typeLabel() {
    return game.i18n.localize(DASU.damageTypes[this.type] ?? '');
  }

  /** Localized label for the targeted resource. */
  get resourceLabel() {
    return game.i18n.localize(DASU.damageResources[this.resource] ?? '');
  }
}
