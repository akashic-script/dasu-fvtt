const DASU = {};

// Constants (uppercase)
DASU.SYSTEM = 'dasu';

DASU.ARCHETYPES = ['hero', 'rogue', 'sage', 'trickster'];

DASU.SUBTYPES = ['child', 'self', 'god'];

DASU.ABILITY_CATEGORIES = ['spell', 'affliction', 'restorative', 'technique'];

DASU.RANGE_TYPES = ['melee', 'ranged'];

// New item types for summoner progression
DASU.SCHEMA_TYPES = ['first', 'second'];

// Class-related configuration
DASU.CLASS_CATEGORIES = ['official', 'homebrew', 'community'];
DASU.LEVEL_BONUS_TYPES = [
  'ap',
  'sp',
  'schema',
  'aptitude',
  'ability',
  'feature',
  'weapon',
  'item',
  'skill',
  'attribute',
];
DASU.STARTING_ATTRIBUTE_TOTAL = 4;

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
  'class',
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

// Formula-based system for AP progression (1 AP at odd levels 1-29)
// gain AP, adds 1 at odd levels: 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29

// Specific to summoner actor type
// gain SP, adds 2 every level

// Refactor attributes, remove base in each attribute (this includes the field in editor and ui),
// ticks remain a derived, you still have to buy it, meaning 1AP = 1Tick

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

// Class-based progression system
// Replaces hardcoded progression with dynamic class-based configuration
DASU.levelSummonerFormulas = {
  /**
   * Get AP formula from actor's assigned class, with fallback to settings
   * @param {Actor} actor - The summoner actor
   * @returns {string} - The AP progression formula
   */
  getAPFormula(actor) {
    const classData = actor?.system?.getClassData?.();
    if (classData?.progression?.apFormula) {
      return classData.progression.apFormula;
    }
    // Fallback to settings if no class assigned
    return game.settings.get('dasu', 'apFormula') || 'odd:1-29';
  },

  /**
   * Get SP formula from actor's assigned class, with fallback to settings
   * @param {Actor} actor - The summoner actor
   * @returns {string} - The SP progression formula
   */
  getSPFormula(actor) {
    const classData = actor?.system?.getClassData?.();
    if (classData?.progression?.spFormula) {
      return classData.progression.spFormula;
    }
    // Fallback to settings if no class assigned
    return game.settings.get('dasu', 'spFormula') || '2*level';
  },

  /**
   * Get level bonuses from actor's assigned class
   * @param {Actor} actor - The summoner actor
   * @param {number} level - The character level
   * @returns {Array} - Array of level bonuses for that level
   */
  getLevelBonuses(actor, level) {
    const classData = actor?.system?.getClassData?.();
    if (classData?.levelBonuses) {
      return actor.system.getClassBonusesForLevel(level);
    }
    // Fallback to default progression if no class assigned
    return this.getDefaultLevelBonuses(level);
  },

  /**
   * Get default level bonuses for actors without assigned classes
   * @param {number} level - The character level
   * @returns {Array} - Array of default level bonuses
   */
  getDefaultLevelBonuses(level) {
    const bonuses = [];

    // Default ability gain levels
    if ([5, 10, 15, 20, 25, 30].includes(level)) {
      bonuses.push({ type: 'ability', level, description: 'Gain new ability' });
    }

    // Default aptitude gain levels
    if ([3, 7, 11, 15, 19, 23, 27].includes(level)) {
      bonuses.push({
        type: 'aptitude',
        level,
        description: 'Increase any aptitude by 1',
      });
    }

    // Default schema progression
    if ([1].includes(level)) {
      bonuses.push({
        type: 'schema',
        level,
        schemaSlot: 1,
        schemaLevel: 1,
        description: 'Gain first schema',
      });
    }
    if ([5, 15, 25].includes(level)) {
      bonuses.push({
        type: 'schema',
        level,
        schemaSlot: 1,
        schemaLevel: Math.min(3, Math.floor((level - 1) / 10) + 2),
        description: 'Advance first schema',
      });
    }
    if ([10].includes(level)) {
      bonuses.push({
        type: 'schema',
        level,
        schemaSlot: 2,
        schemaLevel: 1,
        description: 'Gain second schema',
      });
    }
    if ([20].includes(level)) {
      bonuses.push({
        type: 'schema',
        level,
        schemaSlot: 2,
        schemaLevel: 2,
        description: 'Advance second schema',
      });
    }

    return bonuses;
  },
};

// Enhanced helper functions for class-based progression
DASU.calculateAP = function (level, actor = null, formula = null) {
  // Use class-based formula if actor provided
  if (actor) {
    formula = DASU.levelSummonerFormulas.getAPFormula(actor);
  } else if (!formula) {
    formula = 'odd:1-29'; // Default fallback
  }

  return DASU.evaluateProgressionFormula(formula, level);
};

DASU.calculateSP = function (level, actor = null, formula = null) {
  // Use class-based formula if actor provided
  if (actor) {
    formula = DASU.levelSummonerFormulas.getSPFormula(actor);
  } else if (!formula) {
    formula = '2*level'; // Default fallback
  }

  return DASU.evaluateProgressionFormula(formula, level);
};

/**
 * Evaluate a progression formula for a given level
 * @param {string} formula - The formula to evaluate
 * @param {number} level - The character level
 * @returns {number} - The calculated value
 */
DASU.evaluateProgressionFormula = function (formula, level) {
  try {
    // Handle special formula formats
    if (formula.includes('odd:')) {
      const match = formula.match(/odd:(\d+)-(\d+)/);
      if (match) {
        const start = parseInt(match[1]);
        const end = parseInt(match[2]);
        let total = 0;
        for (let i = start; i <= Math.min(end, level); i++) {
          if (i % 2 === 1) total += 1;
        }
        return total;
      }
    }

    if (formula.includes('even:')) {
      const match = formula.match(/even:(\d+)-(\d+)/);
      if (match) {
        const start = parseInt(match[1]);
        const end = parseInt(match[2]);
        let total = 0;
        for (let i = start; i <= Math.min(end, level); i++) {
          if (i % 2 === 0) total += 1;
        }
        return total;
      }
    }

    // Replace 'level' with actual level value and evaluate
    const expression = formula.replace(/level/g, level.toString());

    // Simple evaluation for basic mathematical expressions
    if (!/^[\d+\-*/()s.]+$/.test(expression)) {
      console.warn(`Invalid progression formula: ${formula}`);
      return 0;
    }

    return Math.floor(eval(expression)) || 0;
  } catch (error) {
    console.warn(
      `Error evaluating progression formula "${formula}" for level ${level}:`,
      error
    );
    return 0;
  }
};

/**
 * Calculate total progression points from level 1 to target level
 * @param {string} formula - The progression formula
 * @param {number} targetLevel - The target level
 * @returns {number} - Total points earned
 */
DASU.calculateTotalProgression = function (formula, targetLevel) {
  let total = 0;
  for (let i = 1; i <= targetLevel; i++) {
    total += DASU.evaluateProgressionFormula(formula, i);
  }
  return total;
};

/**
 * Calculate level gains for a summoner based on their class
 * @param {number} level - The character level
 * @param {Actor} actor - The summoner actor (optional, for class-based calculation)
 * @returns {Object} - Object containing all gains for that level
 */
DASU.calculateLevelGains = function (level, actor = null) {
  // Calculate AP/SP based on class or defaults
  const ap = DASU.calculateAP(level, actor);
  const sp = DASU.calculateSP(level, actor);

  // Get level bonuses from class or defaults
  const levelBonuses = actor
    ? DASU.levelSummonerFormulas.getLevelBonuses(actor, level)
    : DASU.levelSummonerFormulas.getDefaultLevelBonuses(level);

  // Parse level bonuses into gain flags
  const gains = {
    level,
    gainAP: ap,
    gainSP: sp,
    gainAbility: false,
    gainAptitude: false,
    gainFirstSchema: 0,
    gainSecondSchema: 0,
    gainThirdSchema: 0,
    levelBonuses: levelBonuses, // Include raw bonuses for detailed processing
  };

  // Process level bonuses to set gain flags
  for (const bonus of levelBonuses) {
    switch (bonus.type) {
      case 'ability':
        gains.gainAbility = true;
        break;
      case 'aptitude':
        gains.gainAptitude = true;
        break;
      case 'schema':
        if (bonus.schemaSlot === 1) {
          gains.gainFirstSchema = bonus.schemaLevel || 1;
        } else if (bonus.schemaSlot === 2) {
          gains.gainSecondSchema = bonus.schemaLevel || 1;
        } else if (bonus.schemaSlot === 3) {
          gains.gainThirdSchema = bonus.schemaLevel || 1;
        }
        break;
    }
  }

  return gains;
};

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
  untyped: 'DASU.damageTypes.untyped',
  physical: 'DASU.damageTypes.physical',
  fire: 'DASU.damageTypes.fire',
  ice: 'DASU.damageTypes.ice',
  electric: 'DASU.damageTypes.electric',
  wind: 'DASU.damageTypes.wind',
  earth: 'DASU.damageTypes.earth',
  light: 'DASU.damageTypes.light',
  dark: 'DASU.damageTypes.dark',
};

DASU.resType = {
  '-1': 'DASU.resistanceTypes.-1.long',
  0: 'DASU.resistanceTypes.0.long',
  1: 'DASU.resistanceTypes.1.long',
  2: 'DASU.resistanceTypes.2.long',
  3: 'DASU.resistanceTypes.3.long',
};

DASU.resTypeAbbr = {
  '-1': 'DASU.resistanceTypes.-1.short',
  0: 'DASU.resistanceTypes.0.short',
  1: 'DASU.resistanceTypes.1.short',
  2: 'DASU.resistanceTypes.2.short',
  3: 'DASU.resistanceTypes.3.short',
};

DASU.resIcon = {
  physical: 'systems/dasu/assets/static/resistances/physical.png',
  fire: 'systems/dasu/assets/static/resistances/fire.png',
  ice: 'systems/dasu/assets/static/resistances/ice.png',
  electric: 'systems/dasu/assets/static/resistances/electric.png',
  wind: 'systems/dasu/assets/static/resistances/wind.png',
  earth: 'systems/dasu/assets/static/resistances/earth.png',
  light: 'systems/dasu/assets/static/resistances/light.png',
  dark: 'systems/dasu/assets/static/resistances/dark.png',
};

DASU.resistanceTypes = {
  '-1': { long: 'Weak', short: 'WK' },
  0: { long: 'Normal', short: '-' },
  1: { long: 'Resist', short: 'RS' },
  2: { long: 'Nullify', short: 'NU' },
  3: { long: 'Drain', short: 'DR' },
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

// Roll Data Aliases
DASU.rollDataAliases = {
  // Attributes
  pow: 'system.attributes.pow.tick',
  dex: 'system.attributes.dex.tick',
  will: 'system.attributes.will.tick',
  sta: 'system.attributes.sta.tick',
  // Stats
  hpCurrent: 'system.stats.hp.current',
  hpMax: 'system.stats.hp.max',
  wpCurrent: 'system.stats.wp.current',
  wpMax: 'system.stats.wp.max',
  avoid: 'system.stats.avoid.value',
  def: 'system.stats.def.value',
  crit: 'system.stats.crit.value',
  // Level
  level: 'system.level',
};

// Export the DASU object
export default DASU;
