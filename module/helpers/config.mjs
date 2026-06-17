export const DASU = {};

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

DASU.itemResources = {
  hp: 'DASU.Item.Item.ResourceHP',
  wp: 'DASU.Item.Item.ResourceWP',
  status: 'DASU.Item.Item.ResourceStatus',
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
