/**
 * A reusable quantity field
 * @param {object} [opts]  NumberField option overrides.
 */
export function QuantityField(opts = {}) {
  return new foundry.data.fields.NumberField({
    required: true,
    nullable: false,
    integer: true,
    initial: 1,
    min: 1,
    ...opts,
  });
}
