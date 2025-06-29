import { slugify } from '../utils/slugify.mjs';

/**
 * Extend the base Item document by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Item}
 */
export class DASUItem extends Item {
  /**
   * Augment the basic Item data model with additional dynamic data.
   */
  prepareData() {
    // As with the actor class, items are documents that can have their data
    // preparation methods overridden (such as prepareBaseData()).
    super.prepareData();

    if (this.type === 'weapon') {
      this._ensureTagSlots();
    }
  }

  /** @override */
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);

    // Ensure system object exists
    data.system = data.system || {};

    // Set dsid based on the item's name if not already set
    if (!data.system.dsid && data.name) {
      data.system.dsid = slugify(data.name);
    }

    // Set category for ability items since they require subcategorization
    if (data.type === 'ability' && !data.system.category) {
      data.system.category = globalThis.DASU.ABILITY_CATEGORIES[0]; // Use first category from config
    }
  }

  /** @override */
  async _preUpdate(changed, options, user) {
    await super._preUpdate(changed, options, user);

    // Update dsid if the name changed and dsid is empty
    if (changed.name && (!this.system.dsid || this.system.dsid === '')) {
      changed.system = changed.system || {};
      changed.system.dsid = slugify(changed.name);
    }

    // Handle ability category changes
    if (this.type === 'ability' && changed.system?.category) {
      await this._handleAbilityCategoryChange(changed);
    }
  }

  /**
   * Handle ability category changes by transferring compatible attributes and removing incompatible ones
   * @param {Object} changed - The changed data object
   */
  async _handleAbilityCategoryChange(changed) {
    const oldCategory = this.system.category;
    const newCategory = changed.system.category;

    if (oldCategory === newCategory) return;

    console.log(
      `DASU: Ability category changing from ${oldCategory} to ${newCategory}`
    );

    // Define which fields are compatible between categories (shared across all ability types)
    const compatibleFields = ['damage', 'cost', 'toHit', 'effect'];

    // Define category-specific fields that should be removed when switching away from that category
    const categorySpecificFields = {
      technique: ['effect'], // effect is shared, so won't be removed
      spell: ['aptitudes'],
      affliction: ['effect'], // effect is shared, so won't be removed
      restorative: ['healAmount', 'healType', 'effect'], // effect is shared, so won't be removed
    };

    // Get fields that should be removed for the new category
    const fieldsToRemove = [];
    Object.entries(categorySpecificFields).forEach(([category, fields]) => {
      if (category !== newCategory) {
        fields.forEach((field) => {
          // Only remove fields that are not compatible (shared) between categories
          if (!compatibleFields.includes(field)) {
            fieldsToRemove.push(field);
          }
        });
      }
    });

    // Remove incompatible fields
    const updates = {};
    const removedFields = [];

    fieldsToRemove.forEach((field) => {
      if (this.system[field] !== undefined && this.system[field] !== null) {
        updates[`system.${field}`] = null;
        removedFields.push(field);
        console.log(`DASU: Removing incompatible field: ${field}`);
      }
    });

    // Apply the updates if there are fields to remove
    if (Object.keys(updates).length > 0) {
      await this.update(updates, { diff: false });

      // Notify the user about removed fields
      if (removedFields.length > 0) {
        const fieldNames = removedFields
          .map((field) => {
            // Convert field names to more readable format
            const fieldMap = {
              aptitudes: 'Aptitudes',
              healAmount: 'Heal Amount',
              healType: 'Heal Type',
            };
            return fieldMap[field] || field;
          })
          .join(', ');

        ui.notifications.info(
          `Switched ability category from ${oldCategory} to ${newCategory}. ` +
            `Removed incompatible fields: ${fieldNames}`
        );
      }
    }
  }

  _ensureTagSlots() {
    const slots = this.system.tagSlots || {};
    const maxSlots = this.system.maxTagSlots;
    const currentSlots = Object.keys(slots).length;

    if (currentSlots < maxSlots) {
      const updates = {};
      for (let i = currentSlots; i < maxSlots; i++) {
        updates[`system.tagSlots.slot${i + 1}`] = { tagId: null, rank: 1 };
      }
      if (Object.keys(updates).length > 0 && this.id) {
        this.update(updates, { diff: false });
      }
    }
  }

  async addTag(tagId, rank = 1) {
    const tag = game.items.get(tagId);
    if (!tag || tag.type !== 'tag') {
      ui.notifications.error('Invalid tag');
      return false;
    }

    const availableSlot = this.getAvailableSlot();
    if (!availableSlot) {
      ui.notifications.error('No available slots');
      return false;
    }

    const validRank = Math.max(1, Math.min(tag.system.maxRank, rank));
    await this.update({
      [`system.tagSlots.${availableSlot}.tagId`]: tagId,
      [`system.tagSlots.${availableSlot}.rank`]: validRank,
    });

    ui.notifications.info(`Added ${tag.name} to weapon`);
    return true;
  }

  async removeTag(slotKey) {
    await this.update({
      [`system.tagSlots.${slotKey}.tagId`]: null,
      [`system.tagSlots.${slotKey}.rank`]: 1,
    });
    ui.notifications.info('Tag removed');
    return true;
  }

  async updateTagRank(slotKey, newRank) {
    const slot = this.system.tagSlots[slotKey];
    if (!slot?.tagId) return false;

    const tag = game.items.get(slot.tagId);
    const validRank = Math.max(1, Math.min(tag.system.maxRank, newRank));

    await this.update({
      [`system.tagSlots.${slotKey}.rank`]: validRank,
    });
    return true;
  }

  getAvailableSlot() {
    const slots = this.system.tagSlots || {};
    return Object.keys(slots).find((key) => !slots[key].tagId) || null;
  }

  getEquippedTags() {
    const slots = this.system.tagSlots || {};
    const tags = [];

    for (const [slotKey, slot] of Object.entries(slots)) {
      if (slot.tagId) {
        const tag = game.items.get(slot.tagId);
        if (tag) {
          tags.push({
            slotKey,
            tag,
            rank: slot.rank,
            effects: this._calculateTagEffects(tag, slot.rank),
          });
        }
      }
    }
    return tags;
  }

  _calculateTagEffects(tag, rank) {
    return tag.system.effects.map((effect) => ({
      ...effect,
      calculatedValue: this._scaleEffectValue(effect.value, rank),
    }));
  }

  _scaleEffectValue(value, rank) {
    const match = value.match(/([+-])(\d+)/);
    if (match) {
      const sign = match[1];
      const base = parseInt(match[2]);
      return `${sign}${base * rank}`;
    }
    return value;
  }

  getCalculatedStats() {
    const base = {
      damage: this.system.damage,
      toHit: this.system.toHit,
    };

    const tags = this.getEquippedTags();

    for (const tagData of tags) {
      for (const effect of tagData.effects) {
        if (effect.type === 'damage_bonus') {
          base.damage +=
            parseInt(effect.calculatedValue.replace(/[+-]/, '')) || 0;
        }
        if (effect.type === 'accuracy_bonus') {
          base.toHit +=
            parseInt(effect.calculatedValue.replace(/[+-]/, '')) || 0;
        }
      }
    }
    return base;
  }

  /**
   * Prepare a data object which defines the data schema used by dice roll commands against this Item
   * @override
   */
  getRollData() {
    // Starts off by populating the roll data with a shallow copy of `this.system`
    const rollData = { ...this.system };

    // Quit early if there's no parent actor
    if (!this.actor) return rollData;

    // If present, add the actor's roll data
    rollData.actor = this.actor.getRollData();

    return rollData;
  }

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
  async roll(event) {
    const item = this;

    // Initialize chat data.
    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    const rollMode = game.settings.get('core', 'rollMode');
    const label = `[${item.type}] ${item.name}`;

    // If there's no roll data, send a chat message.
    if (!this.system.formula) {
      ChatMessage.create({
        speaker: speaker,
        rollMode: rollMode,
        flavor: label,
        content: item.system.description ?? '',
      });
    }
    // Otherwise, create a roll and send a chat message from it.
    else {
      // Retrieve roll data.
      const rollData = this.getRollData();

      // Invoke the roll and submit it to chat.
      const roll = new Roll(rollData.formula, rollData.actor);
      // If you need to store the value first, uncomment the next line.
      // const result = await roll.evaluate();
      roll.toMessage({
        speaker: speaker,
        rollMode: rollMode,
        flavor: label,
      });
      return roll;
    }
  }
}
