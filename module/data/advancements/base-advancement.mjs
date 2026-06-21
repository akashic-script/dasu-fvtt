import { TypedPseudoDocument } from '../pseudo/typed-pseudo-document.mjs';

/**
 * @abstract
 */
export default class BaseAdvancement extends TypedPseudoDocument {
  static get documentName() {
    return 'Advancement';
  }

  static LABEL = 'DASU.Advancement.Base.Label';
  static ICON = 'fa-solid fa-circle-nodes';

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();
    schema.level = new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 1,
      min: 1,
    });
    schema.description = new fields.HTMLField({ required: false, initial: '' });
    return schema;
  }

  /** @returns {{ label: string, type: string }[]} Collapsed-row badges shown in the class sheet. */
  getBadges() {
    return [];
  }

  /** @returns {object} Data passed to this type's expand-editor partial. */
  getExpandData() {
    return {};
  }

  /**
   * Planner entries this advancement contributes for a level row on the actor sheet.
   * @param {Actor} _actor
   * @param {{ level: number, currentLevel: number }} _ctx
   * @returns {object[]}
   */
  getPlannerEntries(_actor, _ctx) {
    return [];
  }

  static FLAG_SCOPE = 'dasu';
  static FLAG_KEY = (advId) => `advancementChoices.${advId}`;

  /** @returns {boolean} Whether the player fills this slot on the actor planner. */
  get isFillSlot() {
    return false;
  }

  get typeLabel() {
    return this.itemType
      ? game.i18n.localize(`TYPES.Item.${this.itemType}`)
      : game.i18n.localize('DASU.Item.Class.GrantTypeAny');
  }

  getChoice(actor) {
    return (
      actor?.getFlag(BaseAdvancement.FLAG_SCOPE, BaseAdvancement.FLAG_KEY(this.id)) ??
      null
    );
  }

  _slotPlannerEntry(actor, { level, currentLevel }) {
    const choice = this.getChoice(actor);
    const item = choice?.itemId ? actor.items.get(choice.itemId) : null;
    return {
      kind: 'slot',
      advancementId: this.id,
      itemType: this.itemType,
      accentType: item?.type ?? this.itemType,
      typeLabel: this.typeLabel,
      filled: !!item,
      filledName: item?.name ?? null,
      reached: level <= currentLevel,
    };
  }

  /**
   * @param {Actor} actor
   * @param {string} sourceUuid
   */
  async slot(actor, sourceUuid) {
    if (!this.isFillSlot) return;
    const source = await fromUuid(sourceUuid);
    if (!source) return;
    if (this.itemType && source.type !== this.itemType) {
      ui.notifications?.warn(
        game.i18n.format('DASU.Planner.SlotWrongType', { type: this.typeLabel })
      );
      return;
    }

    await this.clearFromActor(actor);

    const copyData = source.toObject();
    delete copyData._id;
    foundry.utils.setProperty(copyData, 'flags.dasu.slotCopy', true);
    foundry.utils.setProperty(copyData, 'flags.dasu.slotAdvancementId', this.id);
    const [created] = await actor.createEmbeddedDocuments('Item', [copyData]);

    if (source.parent === actor && source.id !== created?.id) {
      await actor.deleteEmbeddedDocuments('Item', [source.id]);
    }

    await actor.setFlag(
      BaseAdvancement.FLAG_SCOPE,
      BaseAdvancement.FLAG_KEY(this.id),
      { sourceUuid, itemId: created?.id ?? null }
    );
  }

  _onDelete() {
    super._onDelete();
    if (!this.isFillSlot) return;
    const actor = this.parent?.parent?.parent;
    if (actor instanceof Actor) {
      this.clearFromActor(actor).catch((err) =>
        console.error('DASU | clearFromActor on advancement delete failed', err)
      );
    }
  }

  async clearFromActor(actor) {
    const toDelete = actor.items
      .filter((item) => item.getFlag('dasu', 'slotAdvancementId') === this.id)
      .map((item) => item.id);
    if (toDelete.length) {
      await actor.deleteEmbeddedDocuments('Item', toDelete);
    }
    await actor.unsetFlag(
      BaseAdvancement.FLAG_SCOPE,
      BaseAdvancement.FLAG_KEY(this.id)
    );
  }
}
