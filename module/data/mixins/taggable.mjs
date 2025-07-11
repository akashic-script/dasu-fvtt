export const TaggableMixin = (superclass) =>
  class extends superclass {
    static defineSchema() {
      const fields = foundry.data.fields;
      const schema = super.defineSchema();
      return {
        ...schema,
        tagSlots: new fields.ObjectField({
          required: false,
          initial: {},
        }),
        maxTagSlots: new fields.NumberField({
          required: true,
          initial: 0,
          min: 0,
        }),
      };
    }

    // Add a tag to a slot
    async addTagToSlot(tagId, slotKey) {
      const tag = game.items.get(tagId);
      if (!tag || tag.type !== 'tag') return false;
      if (!this.canAcceptTag(tag, slotKey)) {
        throw new Error('Tag cannot be slotted into this item');
      }
      const tagSlots = this.system.tagSlots || {};
      tagSlots[slotKey] = { tagId, rank: 1 };
      await this.update({ 'system.tagSlots': tagSlots });
      // Transfer effects for the current rank
      await this._applyTagActiveEffects(tagId);
      return true;
    }

    // Remove a tag from a slot
    async removeTagFromSlot(slotKey) {
      const tagSlots = this.system.tagSlots || {};
      const slot = tagSlots[slotKey];
      if (slot && slot.tagId) {
        const tag = game.items.get(slot.tagId);
        if (tag) {
          await this._removeTagActiveEffects(slot.tagId);
        }
        delete tagSlots[slotKey];
        await this.update({ 'system.tagSlots': tagSlots });
      }
    }

    // Override in specific models for custom validation
    canAcceptTag(tag, slotKey) {
      return tag.isValidForItem(this);
    }

    // Get all slotted tags
    getSlottedTags() {
      const tagSlots = this.system.tagSlots || {};
      return Object.values(tagSlots)
        .map((slot) => game.items.get(slot.tagId))
        .filter((tag) => tag);
    }

    async _applyTagActiveEffects(tagId) {
      const tag = this.actor ? this.actor.items.get(tagId) : null;
      if (!tag) return;
      for (const effect of tag.effects.contents) {
        const effectData = effect.toObject();
        effectData.flags = effectData.flags || {};
        effectData.flags.dasu = { sourceTag: tag.id };
        if (effect.transfer) {
          // Apply to actor
          if (this.actor)
            await this.actor.createEmbeddedDocuments('ActiveEffect', [
              effectData,
            ]);
        } else {
          // Apply to item
          await this.createEmbeddedDocuments('ActiveEffect', [effectData]);
        }
      }
    }

    async _removeTagActiveEffects(tagId) {
      // Remove effects from item
      const itemEffects = this.effects.filter(
        (e) => e.flags?.dasu?.sourceTag === tagId
      );
      for (const effect of itemEffects) await effect.delete();

      // Remove effects from actor
      if (this.actor) {
        const actorEffects = this.actor.effects.filter(
          (e) => e.flags?.dasu?.sourceTag === tagId
        );
        for (const effect of actorEffects) await effect.delete();
      }
    }
  };
