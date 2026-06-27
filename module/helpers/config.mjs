export const DASU = {};

/**
 * The system id, used to scope flags, hooks and template paths.
 * @type {string}
 */
export const SYSTEM = 'dasu';

/**
 * Check type -> localization key, used for chat flavor titles.
 * @type {Object<string, string>}
 */
DASU.checkTypes = {
  attribute: 'DASU.Check.Type.Attribute',
  skill: 'DASU.Check.Type.Skill',
  accuracy: 'DASU.Check.Type.Accuracy',
  tactic: 'DASU.Check.Type.Tactic',
  initiative: 'DASU.Check.Type.Initiative',
  open: 'DASU.Check.Type.Open',
  display: 'DASU.Check.Type.Display',
};

/**
 * Core check roll constants (DASU: roll N d{faces} + tick, meet/exceed TN).
 */
DASU.check = Object.freeze({
  baseDice: 2,
  faces: 10,
  // Crit: doubles where both dice meet the threshold. Starts at 11; on a d10
  // it only becomes reachable once reduced.
  defaultCritThreshold: 11,
  minCritThreshold: 2,
});

/**
 * The set of Ability Scores used within the system.
 * @type {Object}
 */
DASU.attributes = {
  pow: 'DASU.Ability.Pow.long',
  dex: 'DASU.Ability.Dex.long',
  wil: 'DASU.Ability.Wil.long',
  sta: 'DASU.Ability.Sta.long',
};

DASU.attributeAbbreviations = {
  pow: 'DASU.Ability.Pow.abbr',
  dex: 'DASU.Ability.Dex.abbr',
  wil: 'DASU.Ability.Wil.abbr',
  sta: 'DASU.Ability.Sta.abbr',
};

/**
 * Cumulative merits required to reach each level.
 * @type {Object<number, number>}
 */
DASU.levelMerits = {
  1: 0,
  2: 1,
  3: 3,
  4: 6,
  5: 10,
  6: 16,
  7: 24,
  8: 34,
  9: 46,
  10: 60,
  11: 76,
  12: 94,
  13: 114,
  14: 136,
  15: 160,
  16: 186,
  17: 214,
  18: 244,
  19: 276,
  20: 310,
  21: 346,
  22: 384,
  23: 424,
  24: 466,
  25: 510,
  26: 556,
  27: 604,
  28: 654,
  29: 706,
  30: 760,
};

/**
 * Placeholder merit threshold for a daemon to Transform.
 * Per the rules this is defined per daemon entry; wired up later.
 * @type {number}
 */
DASU.daemonTransformMerits = 100;

/**
 * Derived actor stat paths an archetype bonus may target. Keyed by the
 * dot-path written into the actor's system during derived-data prep.
 * @type {Record<string, string>}
 */
DASU.archetypeBonusTargets = {
  'resources.hp.max': 'DASU.Archetype.Target.HpMax',
  'resources.wp.max': 'DASU.Archetype.Target.WpMax',
  'stats.avoid.value': 'DASU.Archetype.Target.Avoid',
  'stats.defense.value': 'DASU.Archetype.Target.Defense',
  'stats.hit.value': 'DASU.Archetype.Target.Hit',
  'stats.land.value': 'DASU.Archetype.Target.Land',
};

DASU.weaponCategories = {
  small: 'DASU.Item.Weapon.CategorySmall',
  large: 'DASU.Item.Weapon.CategoryLarge',
  ranged: 'DASU.Item.Weapon.CategoryRanged',
  firearm: 'DASU.Item.Weapon.CategoryFirearm',
};

DASU.weaponRanges = {
  melee: 'DASU.Item.Weapon.RangeMelee',
  ranged: 'DASU.Item.Weapon.RangeRanged',
};

DASU.abilityCategories = {
  spell: 'DASU.Item.Ability.CategorySpell',
  affliction: 'DASU.Item.Ability.CategoryAffliction',
  restorative: 'DASU.Item.Ability.CategoryRestorative',
  technique: 'DASU.Item.Ability.CategoryTechnique',
};

DASU.abilityHealResources = {
  hp: 'DASU.Item.Item.ResourceHP',
  wp: 'DASU.Item.Item.ResourceWP',
};

DASU.damageResources = {
  hp: 'DASU.Item.Item.ResourceHP',
  wp: 'DASU.Item.Item.ResourceWP',
};

DASU.damageTypes = {
  fire: 'DASU.DamageType.Fire',
  ice: 'DASU.DamageType.Ice',
  electric: 'DASU.DamageType.Electric',
  wind: 'DASU.DamageType.Wind',
  earth: 'DASU.DamageType.Earth',
  light: 'DASU.DamageType.Light',
  dark: 'DASU.DamageType.Dark',
  physical: 'DASU.DamageType.Physical',
  untyped: 'DASU.DamageType.Untyped',
};

DASU.resistanceTypes = [
  'physical',
  'fire',
  'ice',
  'electric',
  'wind',
  'earth',
  'light',
  'dark',
];

/**
 * Difficulty tiers for skill/attribute checks.
 * Each entry: { key, i18nKey, tn: [lvl1-4, lvl5-9, lvl10-14, lvl15-19, lvl20-24, lvl25-30] }
 */
DASU.difficulties = [
  {
    key: 'routine',
    i18nKey: 'DASU.Difficulty.Routine',
    baseTn: [11, 12, 13, 14, 15, 16],
  },
  {
    key: 'standard',
    i18nKey: 'DASU.Difficulty.Standard',
    baseTn: [13, 14, 15, 16, 17, 18],
  },
  {
    key: 'hard',
    i18nKey: 'DASU.Difficulty.Hard',
    baseTn: [15, 16, 17, 18, 19, 20],
  },
  {
    key: 'extreme',
    i18nKey: 'DASU.Difficulty.Extreme',
    baseTn: [17, 18, 19, 20, 21, 22],
  },
];

/** Returns the TN for a given difficulty key and actor level (1-based). */
DASU.getDifficultyTn = function (difficultyKey, level) {
  const diff = DASU.difficulties.find((d) => d.key === difficultyKey);
  if (!diff) return null;
  const band = Math.min(Math.floor((Math.max(1, level) - 1) / 5), 5);
  return diff.baseTn[band];
};

DASU.resistanceLevels = {
  '-1': 'DASU.Resistance.Weak',
  0: 'DASU.Resistance.Normal',
  1: 'DASU.Resistance.Resist',
  2: 'DASU.Resistance.Nullify',
  3: 'DASU.Resistance.Drain',
};

DASU.aptitudes = {
  f: 'DASU.Aptitude.Fire.long',
  i: 'DASU.Aptitude.Ice.long',
  el: 'DASU.Aptitude.Electric.long',
  w: 'DASU.Aptitude.Wind.long',
  ea: 'DASU.Aptitude.Earth.long',
  l: 'DASU.Aptitude.Light.long',
  d: 'DASU.Aptitude.Dark.long',
  dp: 'DASU.Aptitude.DebuffPhysical.long',
  dm: 'DASU.Aptitude.DebuffMental.long',
  da: 'DASU.Aptitude.DebuffAlmighty.long',
  h: 'DASU.Aptitude.Heal.long',
  tb: 'DASU.Aptitude.TechniqueBrutal.long',
  tt: 'DASU.Aptitude.TechniqueTechnical.long',
  tg: 'DASU.Aptitude.TechniqueGeneral.long',
  ta: 'DASU.Aptitude.TechniqueAlmighty.long',
  assist: 'DASU.Aptitude.Assist.long',
};

DASU.aptitudeAbbreviations = {
  f: 'DASU.Aptitude.Fire.abbr',
  i: 'DASU.Aptitude.Ice.abbr',
  el: 'DASU.Aptitude.Electric.abbr',
  w: 'DASU.Aptitude.Wind.abbr',
  ea: 'DASU.Aptitude.Earth.abbr',
  l: 'DASU.Aptitude.Light.abbr',
  d: 'DASU.Aptitude.Dark.abbr',
  dp: 'DASU.Aptitude.DebuffPhysical.abbr',
  dm: 'DASU.Aptitude.DebuffMental.abbr',
  da: 'DASU.Aptitude.DebuffAlmighty.abbr',
  h: 'DASU.Aptitude.Heal.abbr',
  tb: 'DASU.Aptitude.TechniqueBrutal.abbr',
  tt: 'DASU.Aptitude.TechniqueTechnical.abbr',
  tg: 'DASU.Aptitude.TechniqueGeneral.abbr',
  ta: 'DASU.Aptitude.TechniqueAlmighty.abbr',
  assist: 'DASU.Aptitude.Assist.abbr',
};

DASU.derivedAptitudes = {
  da: { op: 'min', from: ['dp', 'dm'] },
  ta: { op: 'min', from: ['tb', 'tt'] },
  tg: { op: 'max', from: ['tb', 'tt'] },
  assist: { op: 'flag' },
};

DASU.resourceTypes = {
  hp: 'DASU.Resource.HP',
  wp: 'DASU.Resource.WP',
  riches: 'DASU.Resource.Riches',
};

DASU.resourceAbbreviations = {
  hp: 'DASU.Resource.HP',
  wp: 'DASU.Resource.WP',
  riches: 'DASU.Resource.RichesAbbr',
};

DASU.itemCategories = {
  restorative: 'DASU.Item.Item.CategoryRestorative',
  element: 'DASU.Item.Item.CategoryElement',
  hoard: 'DASU.Item.Item.CategoryHoard',
};

DASU.specialAbilityKinds = {
  passive: 'DASU.SpecialAbility.Kind.Passive',
  active: 'DASU.SpecialAbility.Kind.Active',
  reactive: 'DASU.SpecialAbility.Kind.Reactive',
};

DASU.itemResources = {
  hp: 'DASU.Item.Item.ResourceHP',
  wp: 'DASU.Item.Item.ResourceWP',
  status: 'DASU.Item.Item.ResourceStatus',
  damage: 'DASU.Item.Item.ResourceDamage',
};

DASU.itemEffectModes = {
  tick: 'DASU.Item.Item.ModeTick',
  flat: 'DASU.Item.Item.ModeFlat',
  percent: 'DASU.Item.Item.ModePercent',
};

DASU.itemStatusModes = {
  clear: 'DASU.Item.Item.StatusClear',
  grant: 'DASU.Item.Item.StatusGrant',
};

DASU.itemClearModes = {
  choose: 'DASU.Item.Item.ClearChoose',
  all: 'DASU.Item.Item.ClearAll',
};

DASU.skills = {
  athletics: 'DASU.Actor.Skill.Athletics',
  academia: 'DASU.Actor.Skill.Academia',
  craftsmanship: 'DASU.Actor.Skill.Craftsmanship',
  intuition: 'DASU.Actor.Skill.Intuition',
  medicine: 'DASU.Actor.Skill.Medicine',
  perceiving: 'DASU.Actor.Skill.Perceiving',
  stealth: 'DASU.Actor.Skill.Stealth',
  outdoorsmanship: 'DASU.Actor.Skill.Outdoorsmanship',
};
