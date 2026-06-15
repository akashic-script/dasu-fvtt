import { DASU } from "../../helpers/config.mjs";

/**
 * A reusable SchemaField representing a damage roll: numeric value + element type.
 * @param {object} [opts]  Overrides for either sub-field.
 */
export function DamageField(opts = {}) {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    value: new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 0,
      min: 0,
      ...opts.value,
    }),
    damageType: new fields.StringField({
      required: true,
      blank: false,
      initial: "physical",
      choices: Object.keys(DASU.damageTypes),
      ...opts.damageType,
    }),
  });
}
