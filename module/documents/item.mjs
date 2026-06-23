import { EnablePseudoDocumentsMixin } from './enable-pseudo-documents-mixin.mjs';
import { DASURollDialog } from '../ui/roll-dialog.mjs';
import { DASUSchemaDialog } from '../ui/schema-dialog.mjs';

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

    if (this.actor && game.dasu?.Checks) {
      const category = item.system?.category;
      if (item.type === 'schema') {
        return DASUSchemaDialog.open(this.actor, item);
      }
      const NO_DIALOG_TYPES = ['class', 'feature'];
      if (NO_DIALOG_TYPES.includes(item.type)) {
        return game.dasu.Checks.displayCheck(this.actor, item);
      }
      if (
        item.type === 'item' ||
        (item.type === 'ability' &&
          (category === 'restorative' || category === 'affliction'))
      ) {
        return DASURollDialog.openItem(this.actor, item, 'display');
      }
      if (item.type === 'weapon' || item.type === 'ability') {
        return DASURollDialog.openItem(this.actor, item, 'accuracy');
      }
      if (item.type === 'tactic') {
        return DASURollDialog.openItem(this.actor, item, 'tactic');
      }
    }

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
