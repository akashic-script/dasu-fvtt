import { DASU } from '../../helpers/config.mjs';

/**
 * A consumable/item effect block: which resource it touches, how much, and how.
 */
export default class EffectData extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      resource: new fields.StringField({
        required: true,
        blank: false,
        initial: 'hp',
        choices: DASU.itemResources,
      }),
      value: new fields.NumberField({
        required: true,
        nullable: false,
        integer: true,
        initial: 0,
        min: 0,
      }),
      mode: new fields.StringField({
        required: true,
        blank: false,
        initial: 'flat',
        choices: DASU.itemEffectModes,
      }),
      statusMode: new fields.StringField({
        required: true,
        blank: false,
        initial: 'clear',
        choices: DASU.itemStatusModes,
      }),
      clearMode: new fields.StringField({
        required: true,
        blank: false,
        initial: 'choose',
        choices: DASU.itemClearModes,
      }),
      attribute: new fields.StringField({
        required: true,
        blank: false,
        initial: 'pow',
        choices: DASU.attributes,
      }),
      damageType: new fields.StringField({
        required: true,
        blank: false,
        initial: 'physical',
        choices: DASU.damageTypes,
      }),
      grantUuid: new fields.DocumentUUIDField({ type: 'ActiveEffect' }),
    };
  }

  /** True when the effect targets a status rather than a numeric resource. */
  get isStatus() {
    return this.resource === 'status';
  }

  /** True when the effect deals elemental damage. */
  get isDamage() {
    return this.resource === 'damage';
  }

  /** Localized label for the damage type. */
  get damageTypeLabel() {
    return game.i18n.localize(DASU.damageTypes[this.damageType] ?? '');
  }

  /** Localized label for the targeted resource. */
  get resourceLabel() {
    return game.i18n.localize(DASU.itemResources[this.resource] ?? '');
  }
}
