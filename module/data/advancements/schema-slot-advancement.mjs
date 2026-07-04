import BaseAdvancement from './base-advancement.mjs';

export default class SchemaSlotAdvancement extends BaseAdvancement {
  static get TYPE() {
    return 'schemaSlot';
  }

  static LABEL = 'DASU.Advancement.SchemaSlot.Label';
  static ICON = 'fa-solid fa-square-plus';

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();
    schema.itemType = new fields.StringField({
      required: true,
      blank: true,
      initial: 'schema',
    });
    return schema;
  }

  get slotNumber() {
    const all = [...(this.parent?.advancements ?? [])]
      .filter((a) => a.type === 'schemaSlot')
      .sort((a, b) => a.level - b.level || a.sort - b.sort);
    return all.findIndex((a) => a.id === this.id) + 1;
  }

  get isFillSlot() {
    return true;
  }

  getBadges() {
    return [{ label: game.i18n.format('DASU.Planner.SchemaGrant', { slot: this.slotNumber }), type: 'schema' }];
  }

  getPlannerEntries(actor, ctx) {
    return [this._slotPlannerEntry(actor, ctx)];
  }

  async slot(actor, sourceUuid) {
    await super.slot(actor, sourceUuid);
    await actor.applySchemaUpgrades?.();
  }
}
