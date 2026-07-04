import { TypedPseudoDocument } from '../pseudo/typed-pseudo-document.mjs';

/**
 * @abstract
 * Base pseudo-document for tags slotted onto ability/weapon/tactic items.
 * A tag occupies one slot per rank; rank grows by re-slotting the same tag.
 */
export default class BaseTag extends TypedPseudoDocument {
  static get documentName() {
    return 'Tag';
  }

  static get TYPE() {
    return 'base';
  }

  static LABEL = 'DASU.Tag.Base.Label';
  static ICON = 'fa-solid fa-tag';

  /** Tag fields shared by BaseTag (pseudo-doc) and DASUTag (catalog Item). */
  static sharedTagFields() {
    const fields = foundry.data.fields;
    return {
      applicableTypes: new fields.ArrayField(
        new fields.StringField({ required: true, blank: false }),
        { required: false, initial: [] }
      ),
      applicableSubType: new fields.ArrayField(
        new fields.StringField({ required: true, blank: false }),
        { required: false, initial: [] }
      ),
      pricePerRank: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
    };
  }

  /**
   * Whether a tag's applicability (types/subtypes) permits the given host item.
   * @param {{ applicableTypes: string[], applicableSubType: string[] }} tagData
   */
  static checkValidForHost(tagData, hostItem) {
    const types = tagData.applicableTypes ?? [];
    if (types.length && !types.includes('all') && !types.includes(hostItem.type)) return false;
    const subTypes = tagData.applicableSubType ?? [];
    if (subTypes.length && !subTypes.includes('all') && hostItem.system?.category) {
      if (!subTypes.includes(hostItem.system.category)) return false;
    }
    return true;
  }

  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      description: new fields.StringField({ required: false, blank: true, initial: '' }),
      ...BaseTag.sharedTagFields(),
      // Rank = slots invested in this tag; grows by re-slotting, capped by budget.
      rank: new fields.SchemaField({
        current: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 1, min: 1 }),
      }),
      sourceUuid: new fields.StringField({ required: false, blank: true, initial: '' }),
    };
  }

  isValidForHost(hostItem) {
    return BaseTag.checkValidForHost(this, hostItem);
  }

  /** Total economic cost of this tag at its current rank. */
  get totalPrice() {
    return this.pricePerRank * this.rank.current;
  }
}
