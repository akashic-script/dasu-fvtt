/**
 * Extend the basic Item document.
 * @extends {Item}
 */
export class DASUItem extends Item {
  /** @override */
  prepareData() {
    super.prepareData();
  }

  /** @override */
  getRollData() {
    const rollData = { ...super.getRollData() };
    if (!this.actor) return rollData;
    Object.assign(rollData, this.actor.getRollData());
    return rollData;
  }

  /** @override */
  async roll() {
    const item = this;
    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    const rollMode = game.settings.get('core', 'rollMode');
    const label = `[${item.type}] ${item.name}`;

    if (!this.system.formula) {
      await ChatMessage.create({
        speaker,
        rollMode,
        flavor: label,
        content: item.system.description ?? '',
      });
    } else {
      const rollData = this.getRollData();
      const roll = new Roll(rollData.formula, rollData);
      await roll.toMessage({ speaker, rollMode, flavor: label });
      return roll;
    }
  }
}
