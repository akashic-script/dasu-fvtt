/**
 * DASU Combatant document. A summoner combatant renders a fielding tree in the
 * tracker, resolved live from the actor's stock.
 */
export class DASUCombatant extends Combatant {
  /** @returns {boolean} */
  get isSummoner() {
    return this.type === 'summoner' || this.actor?.type === 'summoner';
  }

  /**
   * Whether this combatant is out of the fight (HP or WP at 0). Incapacitated
   * participants are skipped in turn order per the DASU rules.
   * @returns {boolean}
   */
  get isIncapacitated() {
    const res = this.actor?.system?.resources;
    if (!res) return false;
    return (res.hp?.value ?? 1) <= 0 || (res.wp?.value ?? 1) <= 0;
  }
}
