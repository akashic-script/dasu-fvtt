import BaseAdvancement from './base-advancement.mjs';

export default class SchemaUpgradeAdvancement extends BaseAdvancement {
  static get TYPE() {
    return 'schemaUpgrade';
  }

  static LABEL = 'DASU.Item.Class.SchemaUpgrade';
  static ICON = 'fa-solid fa-arrow-up';

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();
    schema.targetAdvancementId = new fields.StringField({ required: true, blank: true });
    return schema;
  }

  /** The schema slot advancement this upgrade targets, or null. */
  get targetSlot() {
    if (!this.targetAdvancementId) return null;
    return this.parent?.advancements?.get(this.targetAdvancementId) ?? null;
  }

  /**
   * Computed tier this upgrade brings the target slot to.
   * Counts how many schemaUpgrade advancements earlier in level/sort order
   * target the same slot, then adds 2 (slot starts at tier 1).
   */
  get upgradeTo() {
    if (!this.targetAdvancementId) return 2;
    const prior = [...(this.parent?.advancements ?? [])]
      .filter((a) => a.type === 'schemaUpgrade' && a.targetAdvancementId === this.targetAdvancementId)
      .sort((a, b) => a.level - b.level || a.sort - b.sort);
    const myIndex = prior.findIndex((a) => a.id === this.id);
    return myIndex + 2;
  }

  #label() {
    const slotAdv = this.targetSlot;
    const slotLabel = slotAdv
      ? game.i18n.format('DASU.Planner.SchemaGrant', { slot: slotAdv.slotNumber })
      : game.i18n.localize('DASU.Advancement.SchemaUpgrade.NoTarget');
    return game.i18n.format('DASU.Planner.SchemaUpgrade', {
      slot: slotLabel,
      to: this.upgradeTo,
    });
  }

  getBadges() {
    return [{ label: this.#label(), type: 'upgrade' }];
  }

  getExpandData() {
    const slotOptions = { '': game.i18n.localize('DASU.Advancement.SchemaUpgrade.ChooseSlot') };
    const slots = [...(this.parent?.advancements ?? [])]
      .filter((a) => a.type === 'schemaSlot')
      .sort((a, b) => a.level - b.level || a.sort - b.sort);
    for (const slot of slots) {
      slotOptions[slot.id] = game.i18n.format('DASU.Planner.SchemaGrant', { slot: slot.slotNumber });
    }
    return {
      targetAdvancementId: this.targetAdvancementId,
      upgradeTo: this.upgradeTo,
      slotOptions,
    };
  }

  getPlannerEntries(_actor, _ctx) {
    return [{ kind: 'schema', label: this.#label() }];
  }
}
