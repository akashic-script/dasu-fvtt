import { DASU } from '../config.mjs';

/** Resistance level -> short label shown on the resistance chip. */
const RESISTANCE_ABBR = { '-1': 'WK', 0: '–', 1: 'RS', 2: 'NU', 3: 'DR' };

/** Resistance level -> chip modifier class (colour). */
const RESISTANCE_CLASS = {
  '-1': 'resistance--weak',
  0: '',
  1: 'resistance--resist',
  2: 'resistance--nullify',
  3: 'resistance--drain',
};

/**
 * Build the `{ <type>: { abbr, cssClass } }` view model the resistance chips
 * template expects, from an actor's system data. Shared by the stock table and
 * the party table so both read resistances the same way.
 * @param {object} sys  An actor's `system`.
 * @returns {Record<string, { abbr: string, cssClass: string }>}
 */
export function resistanceChips(sys) {
  return Object.fromEntries(
    DASU.resistanceTypes.map((key) => {
      const base = sys?.resistances?.[key]?.base ?? 0;
      return [
        key,
        {
          abbr: RESISTANCE_ABBR[String(base)] ?? '–',
          cssClass: RESISTANCE_CLASS[String(base)] ?? '',
        },
      ];
    })
  );
}
