import { DASU } from '../../helpers/config.mjs';

/**
 * A cost paid in a typed resource (hp, wp, or riches).
 * Used by consumable items (shop price) and abilities (activation cost).
 */
export function ResourceField({ defaultType = 'riches', ...opts } = {}) {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    type: new fields.StringField({
      required: true,
      blank: false,
      initial: defaultType,
      choices: DASU.resourceTypes,
    }),
    cost: new fields.StringField({
      required: true,
      blank: true,
      initial: '0',
    }),
  }, opts);
}
