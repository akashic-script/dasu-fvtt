import { EnablePseudoDocumentsMixin } from './enable-pseudo-documents-mixin.mjs';

/**
 * Extend the basic Item document. Pseudo-document collections declared on the system data model
 * (e.g. the class advancement table) are routed through {@link EnablePseudoDocumentsMixin}.
 * @extends {Item}
 */
export class DASUItem extends EnablePseudoDocumentsMixin(Item) {
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
