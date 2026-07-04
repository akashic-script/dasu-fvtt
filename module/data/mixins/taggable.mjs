import { PseudoDocumentCollectionField } from '../pseudo/pseudo-document-collection-field.mjs';
import BaseTag from '../tags/base-tag.mjs';

/**
 * Mixin that adds a `tags` PseudoDocumentCollection and budget getters to an
 * item data model (ability, weapon, tactic).
 *
 * @param {typeof foundry.abstract.TypeDataModel} Base
 */
export const TaggableMixin = (Base) =>
  class TaggableModel extends Base {
    static defineSchema() {
      const schema = super.defineSchema();
      schema.tags = new PseudoDocumentCollectionField(BaseTag);
      schema.maxTagSlots = new foundry.data.fields.NumberField({
        required: false,
        nullable: true,
        integer: true,
        initial: null,
        min: 0,
      });
      return schema;
    }

    /** Total slots available. @returns {number} */
    get tagBudget() {
      return this._tagBudget();
    }

    /** Slots consumed, one per rank across all slotted tags. @returns {number} */
    get tagSlotsUsed() {
      return [...this.tags].reduce((s, t) => s + (t.rank?.current ?? 1), 0);
    }

    /** Free slots remaining. @returns {number} */
    get tagBudgetFree() {
      return this.tagBudget - this.tagSlotsUsed;
    }

    /** Flat budget when a subclass does not override (weapons, tactics). */
    static DEFAULT_TAG_SLOTS = 2;

    /**
     * Subclasses override to provide their budget source.
     * Abilities: aptitude value. Weapons/Tactics: maxTagSlots, else the default.
     * @returns {number}
     */
    _tagBudget() {
      return this.maxTagSlots ?? this.constructor.DEFAULT_TAG_SLOTS;
    }

    prepareDerivedData() {
      super.prepareDerivedData();
      for (const tag of this.tags) tag._safePrepareData();
    }
  };
