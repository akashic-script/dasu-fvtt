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
 * Will Strain: a summoner's cap on fielded daemons is base WILL tick x the
 * party-size multiplier (default x2; raise for small parties, lower for large).
 */
DASU.willStrainMultiplier = 2;

/**
 * Combined cap on Critical Threshold *reduction* from Dejection, Killer, and
 * Hatred sources (after they're summed). The threshold itself never drops below
 * DASU.check.minCritThreshold.
 */
DASU.critReductionCap = 10;

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
 * Maximum tick a single attribute may be raised to, banded by character level.
 *   Levels  1–4  -> 2
 *   Levels  5–9  -> 3
 *   Levels 10–14 -> 4
 *   Levels 15–19 -> 5
 *   Levels 20–30 -> 6
 * @param {number} level
 * @returns {number}
 */
DASU.attributeTickMax = function (level) {
  const lvl = Math.max(1, Number(level) || 1);
  if (lvl <= 4) return 2;
  if (lvl <= 9) return 3;
  if (lvl <= 14) return 4;
  if (lvl <= 19) return 5;
  return 6;
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
 * Daemon combat Roles. Purely descriptive (no mechanical effect); a daemon may
 * carry several. Keys are stored on the actor; values are localization keys.
 * @type {Object<string, string>}
 */
DASU.daemonRoles = {
  fighter: 'DASU.Daemon.Role.Fighter',
  magus: 'DASU.Daemon.Role.Magus',
  assist: 'DASU.Daemon.Role.Assist',
  healer: 'DASU.Daemon.Role.Healer',
  debuffer: 'DASU.Daemon.Role.Debuffer',
  mediator: 'DASU.Daemon.Role.Mediator',
};

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
 * Each entry: { key, i18nKey, tn }
 */
DASU.difficulties = [
  { key: 'routine', i18nKey: 'DASU.Difficulty.Routine', tn: 11 },
  { key: 'standard', i18nKey: 'DASU.Difficulty.Standard', tn: 13 },
  { key: 'hard', i18nKey: 'DASU.Difficulty.Hard', tn: 15 },
  { key: 'extreme', i18nKey: 'DASU.Difficulty.Extreme', tn: 17 },
];

/** Returns the fixed TN for a given difficulty key. */
DASU.getDifficultyTn = function (difficultyKey) {
  const diff = DASU.difficulties.find((d) => d.key === difficultyKey);
  return diff ? diff.tn : null;
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
  foodOfGods: 'DASU.Item.Item.CategoryFoodOfGods',
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

/**
 * The compendium that ships the canonical status effect ActiveEffects. The
 * token HUD and apply-status pipeline both source their documents from here, so
 * GMs can edit the pack to retune statuses without code changes.
 * @type {string}
 */
DASU.statusEffectsPack = 'dasu.statuses';

/**
 * Canonical status effect definitions. This is the single source of truth for:
 *  - registering `CONFIG.statusEffects` (the token HUD palette), and
 *  - generating the `src/packs/statuses` compendium documents.
 *
 * Each entry mirrors the rulebook's Status Effects table. Mechanically simple
 * statuses carry `changes` that Foundry's ActiveEffect engine applies directly;
 * statuses needing engine logic (per-turn damage, action prevention, weakness)
 * are flagged via `dasu.behavior` and handled in the combat-turn automation.
 *
 * Stacking statuses declare `stack` with a literal `max` or an attribute key
 * (`'pow'`/`'sta'`) resolved against the *caster's* tick at apply time.
 *
 * @type {Array<object>}
 */
DASU.statusEffects = [
  {
    id: 'bleeding',
    name: 'DASU.Status.Bleeding.name',
    img: 'icons/svg/blood.svg',
    description: 'DASU.Status.Bleeding.description',
    stack: { max: 'pow' },
    flags: { dasu: { behavior: 'perTurnDamage', damageAttr: 'pow' } },
  },
  {
    id: 'charmed',
    name: 'DASU.Status.Charmed.name',
    img: 'icons/svg/heal.svg',
    description: 'DASU.Status.Charmed.description',
    flags: { dasu: { behavior: 'cannotTargetCaster' } },
  },
  {
    id: 'cursed',
    name: 'DASU.Status.Cursed.name',
    img: 'icons/svg/sun.svg',
    description: 'DASU.Status.Cursed.description',
    flags: { dasu: { behavior: 'doubleFutureDurations' } },
  },
  {
    id: 'dazed',
    name: 'DASU.Status.Dazed.name',
    img: 'icons/svg/daze.svg',
    description: 'DASU.Status.Dazed.description',
    stack: { max: 2 },
    // -1 To Hit per stack; the apply logic scales this change with the stack.
    changes: [
      { key: 'system.bonuses.toHit.all', mode: 2, value: '-1', priority: 20 },
    ],
  },
  {
    id: 'despair',
    name: 'DASU.Status.Despair.name',
    img: 'icons/svg/degen.svg',
    description: 'DASU.Status.Despair.description',
    flags: { dasu: { behavior: 'halveWillTick' } },
  },
  {
    id: 'empowered',
    name: 'DASU.Status.Empowered.name',
    img: 'icons/svg/upgrade.svg',
    description: 'DASU.Status.Empowered.description',
    changes: [
      { key: 'system.bonuses.damage.all', mode: 2, value: '2', priority: 20 },
    ],
  },
  {
    id: 'focused',
    name: 'DASU.Status.Focused.name',
    img: 'icons/svg/target.svg',
    description: 'DASU.Status.Focused.description',
    stack: { max: 2 },
    // +1 To Hit per stack.
    changes: [
      { key: 'system.bonuses.toHit.all', mode: 2, value: '1', priority: 20 },
    ],
  },
  {
    id: 'infected',
    name: 'DASU.Status.Infected.name',
    img: 'icons/svg/acid.svg',
    description: 'DASU.Status.Infected.description',
    stack: { max: 'sta' },
    flags: {
      dasu: {
        behavior: 'perTurnDamage',
        damageAttr: 'pow',
        halvePowerTick: true,
      },
    },
  },
  {
    id: 'invisible1',
    name: 'DASU.Status.Invisible1.name',
    img: 'icons/svg/invisible.svg',
    description: 'DASU.Status.Invisible1.description',
    changes: [
      { key: 'system.stats.avoid.bonus', mode: 2, value: '1', priority: 20 },
    ],
    flags: { dasu: { behavior: 'invisible', tier: 1 } },
  },
  {
    id: 'invisible2',
    name: 'DASU.Status.Invisible2.name',
    img: 'icons/svg/invisible.svg',
    description: 'DASU.Status.Invisible2.description',
    changes: [
      { key: 'system.stats.avoid.bonus', mode: 2, value: '2', priority: 20 },
    ],
    flags: { dasu: { behavior: 'invisible', tier: 2 } },
  },
  {
    id: 'invisible3',
    name: 'DASU.Status.Invisible3.name',
    img: 'icons/svg/invisible.svg',
    description: 'DASU.Status.Invisible3.description',
    changes: [
      { key: 'system.stats.avoid.bonus', mode: 2, value: '2', priority: 20 },
    ],
    flags: { dasu: { behavior: 'invisible', tier: 3, untargetable: true } },
  },
  {
    id: 'rage',
    name: 'DASU.Status.Rage.name',
    img: 'icons/svg/explosion.svg',
    description: 'DASU.Status.Rage.description',
    flags: { dasu: { behavior: 'rage' } },
  },
  {
    id: 'restrained',
    name: 'DASU.Status.Restrained.name',
    img: 'icons/svg/net.svg',
    description: 'DASU.Status.Restrained.description',
    changes: [
      { key: 'system.bonuses.toHit.all', mode: 2, value: '-2', priority: 20 },
      { key: 'system.stats.avoid.bonus', mode: 2, value: '-2', priority: 20 },
    ],
  },
  {
    id: 'silenced',
    name: 'DASU.Status.Silenced.name',
    img: 'icons/svg/silenced.svg',
    description: 'DASU.Status.Silenced.description',
    flags: { dasu: { behavior: 'silenced' } },
  },
  {
    id: 'sleep',
    name: 'DASU.Status.Sleep.name',
    img: 'icons/svg/sleep.svg',
    description: 'DASU.Status.Sleep.description',
    flags: { dasu: { behavior: 'cannotAct', wakeOnAttacked: true } },
  },
  {
    id: 'stunned',
    name: 'DASU.Status.Stunned.name',
    img: 'icons/svg/stoned.svg',
    description: 'DASU.Status.Stunned.description',
    flags: { dasu: { behavior: 'cannotAct' } },
  },
  {
    id: 'unraveled',
    name: 'DASU.Status.Unraveled.name',
    img: 'icons/svg/downgrade.svg',
    description: 'DASU.Status.Unraveled.description',
    flags: { dasu: { behavior: 'weakToAll' } },
  },
];

/**
 * Status ids that may stack, mapped to their cap (literal number or an
 * attribute key resolved against the caster's tick). Derived from
 * {@link DASU.statusEffects} for quick lookup.
 * @type {Object<string, number|string>}
 */
DASU.stackableStatuses = Object.fromEntries(
  DASU.statusEffects.filter((s) => s.stack).map((s) => [s.id, s.stack.max])
);

/** Item types that can have tags slotted onto them. */
DASU.taggableTypes = ['weapon', 'ability', 'tactic', 'specialAbility'];

/** Sub-type choices keyed by taggable item type. Tactic has no sub-types. */
DASU.tagSubTypes = {
  ability: DASU.abilityCategories,
  weapon: DASU.weaponCategories,
};

/** Roll-data variable suggestions for inline command amount fields. */
DASU.inlineAmountVars = [
  '@attributes.pow.value',
  '@attributes.dex.value',
  '@attributes.wil.value',
  '@attributes.sta.value',
  '@skills.athletics.value',
  '@skills.academia.value',
  '@skills.craftsmanship.value',
  '@skills.intuition.value',
  '@skills.medicine.value',
  '@skills.perceiving.value',
  '@skills.stealth.value',
  '@skills.outdoorsmanship.value',
  '@lvl',
  '@dejection',
  '@ap.value',
  '@ap.max',
  '@sp.value',
  '@sp.max',
  '@stats.avoid.value',
  '@stats.defense.value',
  '@stats.hit.value',
  '@stats.land.value',
  '@stats.critical.value',
];
