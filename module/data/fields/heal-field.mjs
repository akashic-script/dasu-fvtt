import HealData from '../models/heal-data.mjs';

/**
 * A reusable healing block (resource + value + mode), backed by {@link HealData}.
 * @param {object} [opts]  EmbeddedDataField options.
 */
export function HealField(opts = {}) {
  return new foundry.data.fields.EmbeddedDataField(HealData, opts);
}
