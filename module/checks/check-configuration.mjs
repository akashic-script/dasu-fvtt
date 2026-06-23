/**
 * Typed accessor over a check's freeform `additionalData` bag. The engine and
 * check object stay schema-light; everything optional (target number, targets,
 * advantage source, damage, traits) is read and written through here so the
 * shapes are documented in one place.
 *
 * - {@link CheckConfiguration.configure} returns a mutable configurer (used in
 *   prepareCheck / processCheck listeners).
 * - {@link CheckConfiguration.inspect} returns a read-only inspector (used in
 *   renderCheck listeners).
 */

const TARGET_NUMBER = 'tn';
const TARGETS = 'targets';
const TARGETED_DEFENSE = 'targetedDefense';
const DAMAGE = 'damage';
const TRAITS = 'traits';
const LABEL = 'label';
const RANGE = 'range';
const RESISTANCE_MODES = 'resistanceModes';
const COST = 'cost';

/**
 * @typedef CheckTarget
 * @property {string} uuid
 * @property {string} name
 * @property {number} [tn] the value to beat on this target (Avoid/Defense)
 * @property {boolean} [hit] resolved after rolling
 */

/**
 * @typedef DamageInfo
 * @property {number} amount
 * @property {string} type one of the eight DASU resistance types
 */

class CheckConfigurer {
  /** @type {Check|CheckResult} */
  #check;

  constructor(check) {
    this.#check = check;
    this.#check.additionalData ??= {};
  }

  get #data() {
    return this.#check.additionalData;
  }

  /** @param {number} tn @returns {CheckConfigurer} */
  setTargetNumber(tn) {
    if (tn != null) this.#data[TARGET_NUMBER] = tn;
    return this;
  }

  /** @param {'avoid'|'defense'} stat @returns {CheckConfigurer} */
  setTargetedDefense(stat) {
    this.#data[TARGETED_DEFENSE] = stat;
    return this;
  }

  /** @param {CheckTarget[]} targets @returns {CheckConfigurer} */
  setTargets(targets) {
    this.#data[TARGETS] = targets;
    return this;
  }

  /** Populate targets from the user's current Foundry targets. @returns {CheckConfigurer} */
  setDefaultTargets() {
    const stat = this.#data[TARGETED_DEFENSE] ?? 'avoid';
    const targets = Array.from(game.user?.targets ?? []).map((t) => ({
      uuid: t.actor?.uuid,
      name: t.actor?.name,
      tn: t.actor?.system?.stats?.[stat]?.value,
    }));
    if (targets.length) this.#data[TARGETS] = targets;
    return this;
  }

  /** @param {DamageInfo} damage @returns {CheckConfigurer} */
  setDamage(damage) {
    this.#data[DAMAGE] = damage;
    return this;
  }

  /** @param {string} label @returns {CheckConfigurer} */
  setLabel(label) {
    this.#data[LABEL] = label;
    return this;
  }

  /** Per-roll range override. @param {'melee'|'ranged'} range @returns {CheckConfigurer} */
  setRange(range) {
    if (range) this.#data[RANGE] = range;
    return this;
  }

  /** Override the damage type while keeping the current amount. @param {string} type @returns {CheckConfigurer} */
  setDamageType(type) {
    if (type && this.#data[DAMAGE]) this.#data[DAMAGE].type = type;
    return this;
  }

  /**
   * Force target reactions for this roll.
   * @param {Array<'weak'|'resist'|'nullify'|'drain'>} modes
   * @returns {CheckConfigurer}
   */
  setResistanceModes(modes) {
    if (modes?.length) this.#data[RESISTANCE_MODES] = [...modes];
    return this;
  }

  /** Per-roll resource cost override. @param {{type:string, value:number}} cost @returns {CheckConfigurer} */
  setCost(cost) {
    if (cost) this.#data[COST] = cost;
    return this;
  }

  /** @param {string} trait @returns {CheckConfigurer} */
  addTrait(trait) {
    this.#data[TRAITS] ??= [];
    if (!this.#data[TRAITS].includes(trait)) this.#data[TRAITS].push(trait);
    return this;
  }

  /**
   * Resolve hit/miss on each target now that the check has a total result.
   * @returns {CheckConfigurer}
   */
  updateTargetResults() {
    const total = this.#check.result;
    if (total == null) return this;
    for (const target of this.#data[TARGETS] ?? []) {
      if (target.tn != null) target.hit = total >= target.tn;
    }
    return this;
  }
}

class CheckInspector {
  /** @type {Check|CheckResult} */
  #check;

  constructor(check) {
    this.#check = check;
  }

  get check() {
    return this.#check;
  }

  /** @returns {number|undefined} */
  getTargetNumber() {
    return this.#check.additionalData?.[TARGET_NUMBER];
  }

  /** @returns {'avoid'|'defense'|undefined} */
  getTargetedDefense() {
    return this.#check.additionalData?.[TARGETED_DEFENSE];
  }

  /** @returns {CheckTarget[]} */
  getTargets() {
    return this.#check.additionalData?.[TARGETS] ?? [];
  }

  /** @returns {DamageInfo|undefined} */
  getDamage() {
    return this.#check.additionalData?.[DAMAGE];
  }

  /** @returns {string[]} */
  getTraits() {
    return this.#check.additionalData?.[TRAITS] ?? [];
  }

  /** @returns {string|undefined} */
  getLabel() {
    return this.#check.additionalData?.[LABEL];
  }

  /** @returns {'melee'|'ranged'|undefined} */
  getRange() {
    return this.#check.additionalData?.[RANGE];
  }

  /** @returns {Array<'weak'|'resist'|'nullify'|'drain'>} */
  getResistanceModes() {
    return this.#check.additionalData?.[RESISTANCE_MODES] ?? [];
  }

  /** @returns {{type:string, value:number}|undefined} */
  getCost() {
    return this.#check.additionalData?.[COST];
  }

  /**
   * Whether the check met its threshold. For targeted checks (accuracy/tactic)
   * succeeds if any target was hit; otherwise compares to the TN.
   * @returns {boolean|null} null when there's nothing to compare against
   */
  isSuccess() {
    const targets = this.getTargets();
    if (targets.length) return targets.some((t) => t.hit);
    const tn = this.getTargetNumber();
    if (tn == null || this.#check.result == null) return null;
    return this.#check.result >= tn;
  }
}

export const CheckConfiguration = Object.freeze({
  /** @param {Check|CheckResult} check @returns {CheckConfigurer} */
  configure: (check) => new CheckConfigurer(check),
  /** @param {Check|CheckResult} check @returns {CheckInspector} */
  inspect: (check) => new CheckInspector(check),
});
