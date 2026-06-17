import DamageData from '../models/damage-data.mjs';

/**
 * A reusable damage block (value + element type), backed by {@link DamageData}.
 * @param {object} [opts]  EmbeddedDataField options.
 */
export function DamageField(opts = {}) {
  return new foundry.data.fields.EmbeddedDataField(DamageData, opts);
}
