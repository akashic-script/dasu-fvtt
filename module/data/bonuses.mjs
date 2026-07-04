/**
 * Situational tuning bonuses.
 *
 * A structured, Active-Effect-targetable layer of fine-grained modifiers that
 * sit *on top of* the derived stats. Every field defaults to 0, so an actor
 * with no effects sees no change. Effects (status effects, gear, traits) write
 * into precise dot-paths - `system.bonuses.damage.spell`,
 * `system.bonuses.incomingDamage.fire`, `system.bonuses.toHit.affliction` -
 * letting a single AE be as general (`.all`) or as specific as needed.
 *
 * The check and pipeline layers read these at resolution time; nothing here
 * changes how base stats are computed.
 */

const { NumberField, SchemaField, EmbeddedDataField } = foundry.data.fields;

const intField = () => new NumberField({ initial: 0, integer: true, nullable: false });

/** hp/wp pair, used for recovery and loss adjustments. */
function resourcePair() {
  return new SchemaField({ hp: intField(), wp: intField() });
}

/**
 * To-Hit (accuracy) bonuses: a blanket `all`, per-weapon-category keys, and
 * per-ability-category keys.
 */
export class HitBonusesDataModel extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      all: intField(),
      // Weapon categories.
      small: intField(),
      large: intField(),
      ranged: intField(),
      firearm: intField(),
      // Ability categories.
      spell: intField(),
      affliction: intField(),
      restorative: intField(),
      technique: intField(),
    };
  }
}

/** To-Land bonus for tactic checks. */
export class LandBonusesDataModel extends foundry.abstract.DataModel {
  static defineSchema() {
    return { all: intField() };
  }
}

/**
 * Damage bonuses, by source-kind and by damage type. Used for both outgoing
 * (`damage`) and incoming (`incomingDamage`) tuning. A resolved bonus sums the
 * blanket `all`, the matching source-kind, and the matching damage type.
 */
export class DamageBonusesDataModel extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      all: intField(),
      // Encounter family: combat (weapon/ability) vs negotiation (tactic).
      combat: intField(),
      negotiation: intField(),
      // Source-kind (outgoing).
      weapon: intField(),
      spell: intField(),
      technique: intField(),
      // Per target archetype.
      hero: intField(),
      sage: intField(),
      rogue: intField(),
      trickster: intField(),
      // Per damage type.
      fire: intField(),
      ice: intField(),
      electric: intField(),
      wind: intField(),
      earth: intField(),
      light: intField(),
      dark: intField(),
      physical: intField(),
      untyped: intField(),
    };
  }
}

export default class BonusesDataModel extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      incomingRecovery: resourcePair(),
      incomingLoss: resourcePair(),
      outgoingRecovery: resourcePair(),
      toHit: new EmbeddedDataField(HitBonusesDataModel),
      toLand: new EmbeddedDataField(LandBonusesDataModel),
      incomingDamage: new EmbeddedDataField(DamageBonusesDataModel),
      damage: new EmbeddedDataField(DamageBonusesDataModel),
    };
  }
}

/**
 * Sum the relevant bonus keys from a DamageBonusesDataModel.
 * Layers: all + (combat|negotiation) + source-kind + damage-type + target-archetype.
 * @param {DamageBonusesDataModel} model
 * @param {object} [opts]
 * @param {string} [opts.kind]         source-kind key (weapon/spell/technique/tactic)
 * @param {string} [opts.type]         damage-type key (fire/ice/.../physical)
 * @param {string} [opts.vsArchetype]  target's archetype identifier (hero/sage/rogue/trickster)
 * @returns {number}
 */
export function sumDamageBonus(model, { kind, type, vsArchetype } = {}) {
  if (!model) return 0;
  // A tactic is the only negotiation source-kind; everything else is combat.
  const family = kind === 'tactic' ? (model.negotiation ?? 0) : (model.combat ?? 0);
  return (
    (model.all ?? 0) +
    family +
    (kind && kind !== 'tactic' ? model[kind] ?? 0 : 0) +
    (type ? model[type] ?? 0 : 0) +
    (vsArchetype ? model[vsArchetype] ?? 0 : 0)
  );
}
