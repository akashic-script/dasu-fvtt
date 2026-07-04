import { DASU } from '../../helpers/config.mjs';

/**
 * A healing block: which resource it touches, how much, and how.
 */
export default class HealData extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      resource: new fields.StringField({
        required: true,
        blank: false,
        initial: 'hp',
        choices: DASU.abilityHealResources,
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
      attribute: new fields.StringField({
        required: true,
        blank: false,
        initial: 'pow',
        choices: DASU.attributes,
      }),
    };
  }

  /** Localized label for the targeted resource. */
  get resourceLabel() {
    return game.i18n.localize(DASU.abilityHealResources[this.resource] ?? '');
  }

  /** Localized label for the scaling attribute. */
  get attributeLabel() {
    return game.i18n.localize(DASU.attributes[this.attribute] ?? '');
  }
}
