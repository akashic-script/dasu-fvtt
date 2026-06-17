import { DASU } from '../../helpers/config.mjs';

/**
 * Aptitude type and rank (1–4).
 */
export function AptitudeField(opts = {}) {
  const fields = foundry.data.fields;
  const requiredInteger = { required: true, nullable: false, integer: true };
  return new fields.SchemaField({
    type: new fields.StringField({
      required: true,
      blank: false,
      initial: 'f',
      choices: Object.keys(DASU.aptitudes),
    }),
    value: new fields.NumberField({ ...requiredInteger, initial: 1, min: 1, max: 4 }),
  }, opts);
}
