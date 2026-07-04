/**
 * A reusable price field
 * @param {object} [opts]  NumberField option overrides.
 */
export function PriceField(opts = {}) {
  return new foundry.data.fields.NumberField({
    required: true,
    nullable: false,
    initial: 0,
    min: 0,
    ...opts,
  });
}
