import { EnablePseudoDocumentsMixin } from './enable-pseudo-documents-mixin.mjs';
import { DASURollDialog } from '../ui/roll-dialog.mjs';
import { DASUSchemaDialog } from '../ui/schema-dialog.mjs';
import { DASUBondDialog } from '../ui/bond-dialog.mjs';

/**
 * Extend the basic Item document. Pseudo-document collections declared on the system data model
 * (e.g. the class advancement table) are routed through {@link EnablePseudoDocumentsMixin}.
 * @extends {Item}
 */
export class DASUItem extends EnablePseudoDocumentsMixin(Item) {
  /** @override */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;

    // Archetypes and subtypes are daemon-exclusive item types.
    const DAEMON_ONLY = { archetype: 'DASU.Archetype.DaemonOnly', subtype: 'DASU.Subtype.DaemonOnly' };
    if (DAEMON_ONLY[data.type] && this.actor && this.actor.type !== 'daemon') {
      ui.notifications.warn(game.i18n.localize(DAEMON_ONLY[data.type]));
      return false;
    }

    // Enforce the subtype's ability/tactic slot cap.
    if (
      (data.type === 'ability' || data.type === 'tactic') &&
      this.actor?.type === 'daemon'
    ) {
      const slot = this.actor.system.slots?.[data.type];
      if (slot?.max != null && slot.used >= slot.max) {
        ui.notifications.warn(
          game.i18n.format('DASU.Subtype.SlotsFull', {
            type: game.i18n.localize(`TYPES.Item.${data.type}`),
            max: slot.max,
          })
        );
        return false;
      }
    }
  }

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
      if (item.type === 'bond') {
        return DASUBondDialog.open(this.actor, item);
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
