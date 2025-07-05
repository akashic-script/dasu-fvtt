const DASU = {};

// Constants (uppercase)
DASU.SYSTEM = 'dasu';

DASU.ARCHETYPES = ['hero', 'rogue', 'sage', 'trickster'];

DASU.SUBTYPES = ['child', 'self', 'god'];

DASU.ABILITY_CATEGORIES = ['spell', 'affliction', 'restorative', 'technique'];

DASU.RANGE_TYPES = ['melee', 'ranged'];

// New item types for summoner progression
DASU.SCHEMA_TYPES = ['first', 'second'];
DASU.STRENGTH_OF_WILL_CATEGORIES = ['Strength of Will'];

// Item types for the system
DASU.ITEM_TYPES = [
  'ability',
  'item',
  'weapon',
  'tag',
  'tactic',
  'special',
  'scar',
  'schema',
  'feature',
];

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

// Specific to summoner actor type
// Formula-based system for AP progression (1 AP at odd levels 1-29)
// gainAP (number), adds 1 at odd levels: 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29
// gainSP (number), adds 2 every level
// gainAbility (boolean), when true allows prompts user to add new ability
// gainAptitude (boolean), when true allows to increase any aptitude by 1
// gainFirstSchema (number), adds 1 to the first schema
// gainSecondSchema (number), adds 1 to the second schema
// gainThirdSchema (number), adds 1 to the third schema
DASU.levelSummonerFormulas = {
  // These will be loaded from settings
  get apFormula() {
    return game.settings.get('dasu', 'apFormula') || 'odd:1-29';
  },
  get spFormula() {
    return game.settings.get('dasu', 'spFormula') || '2*level';
  },

  // Other progression options (can be moved to settings later)
  abilityGainLevels: [5, 10, 15, 20, 25, 30], // Levels where abilities are gained
  aptitudeGainLevels: [3, 7, 11, 15, 19, 23, 27], // Levels where aptitudes are gained
  schemaGainLevels: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30], // Levels where schemas are gained
};

// Helper functions to calculate progression
DASU.calculateAP = function (level, formula = 'odd:1-29') {
  if (formula.startsWith('odd:')) {
    const range = formula.split(':')[1]; // '1-29'
    const [start, end] = range.split('-').map(Number);
    let ap = 0;
    for (let i = start; i <= Math.min(end, level); i++) {
      if (i % 2 === 1) ap += 1; // Odd levels
    }
    return ap;
  }
  return 0;
};

DASU.calculateSP = function (level, formula = '2*level') {
  if (formula === '2*level') {
    return level * 2;
  } else if (formula === 'level') {
    return level;
  }
  return 0;
};

DASU.calculateLevelGains = function (level) {
  const ap = DASU.calculateAP(level, DASU.levelSummonerFormulas.apFormula);
  const sp = DASU.calculateSP(level, DASU.levelSummonerFormulas.spFormula);
  const gainAbility =
    DASU.levelSummonerFormulas.abilityGainLevels.includes(level);
  const gainAptitude =
    DASU.levelSummonerFormulas.aptitudeGainLevels.includes(level);
  const gainFirstSchema = DASU.levelSummonerFormulas.schemaGainLevels.includes(
    level
  )
    ? 1
    : 0;
  const gainSecondSchema = DASU.levelSummonerFormulas.schemaGainLevels.includes(
    level
  )
    ? 1
    : 0;
  const gainThirdSchema = DASU.levelSummonerFormulas.schemaGainLevels.includes(
    level
  )
    ? 1
    : 0;

  return {
    level,
    gainAP: ap,
    gainSP: sp,
    gainAbility,
    gainAptitude,
    gainFirstSchema,
    gainSecondSchema,
    gainThirdSchema,
  };
};

// Legacy table for backward compatibility (can be removed later)
DASU.levelSummonerTable = [];

// Specific to daemon actor type
DASU.levelDaemonTable = [];
// From level 1 to 30
// gainAP (number), adds 1 at odd levels: 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29

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

DASU.RARITY_OPTIONS = [
  { value: 'common', label: 'Common' },
  { value: 'uncommon', label: 'Uncommon' },
  { value: 'rare', label: 'Rare' },
  { value: 'epic', label: 'Epic' },
  { value: 'legendary', label: 'Legendary' },
];

DASU.COST_TYPE_OPTIONS = [
  { value: 'wp', label: 'DASU.CostType.wp' },
  { value: 'hp', label: 'DASU.CostType.hp' },
];

DASU.HEAL_TYPE_OPTIONS = [
  { value: 'hp', label: 'DASU.HealType.hp' },
  { value: 'wp', label: 'DASU.HealType.wp' },
  { value: 'both', label: 'DASU.HealType.both' },
  { value: 'status', label: 'DASU.HealType.status' },
];

// Export the DASU object
export default DASU;
