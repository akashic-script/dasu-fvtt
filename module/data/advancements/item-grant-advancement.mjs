import BaseAdvancement from './base-advancement.mjs';

export default class ItemGrantAdvancement extends BaseAdvancement {
  static get TYPE() {
    return 'itemGrant';
  }

  static LABEL = 'DASU.Item.Class.ItemGrants';
  static ICON = 'fa-solid fa-gift';

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();
    schema.itemType = new fields.StringField({ required: true, blank: true });
    return schema;
  }

  get isFillSlot() {
    return true;
  }

  getBadges() {
    return [{ label: this.typeLabel, type: this.itemType || 'any' }];
  }

  getExpandData() {
    return { itemType: this.itemType };
  }

  getPlannerEntries(actor, { level, currentLevel }) {
    const choice = this.getChoice(actor);
    const item = choice?.itemId ? actor.items.get(choice.itemId) : null;
    return [{
      kind: 'slot',
      advancementId: this.id,
      itemType: this.itemType,
      accentType: 'innate',
      typeLabel: this.typeLabel,
      filled: !!item,
      filledName: item?.name ?? null,
      reached: level <= currentLevel,
    }];
  }
}
