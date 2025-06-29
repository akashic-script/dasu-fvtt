const DASU = {};

// Constants (uppercase)
DASU.SYSTEM = 'dasu';

DASU.ABILITY_CATEGORIES = ['spell', 'affliction', 'restorative', 'technique'];

DASU.RANGE_TYPES = ['melee', 'ranged'];

DASU.CORE_SKILLS = [
  { id: 'athletics', name: 'Athletics', govern: 'pow' },
  { id: 'academia', name: 'Academia', govern: 'will' },
  { id: 'craftsmanship', name: 'Craftsmanship', govern: 'dex' },
  { id: 'intuition', name: 'Intuition', govern: 'will' },
  { id: 'medicine', name: 'Medicine', govern: 'will' },
  { id: 'perceiving', name: 'Perceiving', govern: 'will' },
  { id: 'stealth', name: 'Stealth', govern: 'dex' },
  { id: 'outdoorsmanship', name: 'Outdoorsmanship', govern: 'sta' },
];

DASU.dejectionTable = [
  { level: 1, wp: -5, crit: 0, hasScar: false },
  { level: 2, wp: -10, crit: 0, hasScar: false },
  { level: 3, wp: -10, crit: 0, hasScar: false },
  { level: 4, wp: -25, crit: -1, hasScar: true },
  { level: 5, wp: -25, crit: -1, hasScar: false },
  { level: 6, wp: -25, crit: -2, hasScar: false },
  { level: 7, wp: -25, crit: -2, hasScar: false },
  { level: 8, wp: -40, crit: -3, hasScar: false },
  { level: 9, wp: -40, crit: -3, hasScar: false },
  { level: 10, wp: -50, crit: -4, hasScar: true },
  { level: 11, wp: -50, crit: -4, hasScar: false },
  { level: 12, wp: -50, crit: -4, hasScar: false },
  { level: 13, wp: -50, crit: -4, hasScar: false },
  { level: 14, wp: -50, crit: -4, hasScar: true },
  { level: 15, wp: -50, crit: -4, hasScar: false },
];

DASU.Aptitude = {
  f: 'fire',
  i: 'ice',
  el: 'electric',
  w: 'wind',
  ea: 'earth',
  l: 'light',
  d: 'dark',
  dp: 'debuff_physical',
  dm: 'debuff_mental',
  da: 'debuff_almighty',
  h: 'heal',
  tb: 'technique_brutal',
  tt: 'technique_technical',
  tg: 'technique_general',
  ta: 'technique_almighty',
  assist: 'assist',
};

// Regular properties (camelCase)
DASU.abilities = {
  str: 'DASU.Ability.Str.long',
  dex: 'DASU.Ability.Dex.long',
  con: 'DASU.Ability.Con.long',
  int: 'DASU.Ability.Int.long',
  wis: 'DASU.Ability.Wis.long',
  cha: 'DASU.Ability.Cha.long',
};

DASU.abilityAbbreviations = {
  str: 'DASU.Ability.Str.abbr',
  dex: 'DASU.Ability.Dex.abbr',
  con: 'DASU.Ability.Con.abbr',
  int: 'DASU.Ability.Int.abbr',
  wis: 'DASU.Ability.Wis.abbr',
  cha: 'DASU.Ability.Cha.abbr',
};

DASU.damageTypes = {
  physical: 'DASU.damageTypes.physical',
  fire: 'DASU.damageTypes.fire',
  ice: 'DASU.damageTypes.ice',
  electric: 'DASU.damageTypes.electric',
  wind: 'DASU.damageTypes.wind',
  earth: 'DASU.damageTypes.earth',
  light: 'DASU.damageTypes.light',
  dark: 'DASU.damageTypes.dark',
  untyped: 'DASU.damageTypes.untyped',
};

DASU.spellAffinities = {
  f: 'fire',
  i: 'ice',
  el: 'electric',
  w: 'wind',
  ea: 'earth',
  l: 'light',
  d: 'dark',
};

DASU.techniqueAffinities = {
  tb: 'technique_brutal',
  tt: 'technique_technical',
  tg: 'technique_general',
  ta: 'technique_almighty',
};

DASU.afflictionAffinities = {
  dp: 'debuff_physical',
  dm: 'debuff_mental',
  da: 'debuff_almighty',
  assist: 'assist',
};

DASU.healAffinities = {
  h: 'heal',
  assist: 'assist',
};

// Export the DASU object
export default DASU;
