import EffectData from '../models/effect-data.mjs';

/**
 * A reusable item/consumable effect block, backed by {@link EffectData}.
 * @param {object} [opts]  EmbeddedDataField options.
 */
export function EffectField(opts = {}) {
  return new foundry.data.fields.EmbeddedDataField(EffectData, opts);
}
