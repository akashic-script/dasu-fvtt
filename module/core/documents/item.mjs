import { slugify } from '../../utils/slugify.mjs';
import { DASUAccuracyDialog } from '../../ui/dialogs/accuracy-dialog.mjs';

/**
 * Extend the base Item document by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Item}
 */
export class DASUItem extends Item {
  constructor(data, context) {
    // Ensure data.system exists
    data.system = data.system || {};

    // Ensure dsid is set with a random ID if not already present
    if (!data.system.dsid) {
      data.system.dsid = foundry.utils.randomID(16);
    }

    super(data, context);

    // Ensure tag slots exist for weapons
    if (this.type === 'weapon') {
      this._initializeTagSlots();
    }
  }

  /**
   * Augment the basic Item data model with additional dynamic data.
   */
  prepareData() {
    // As with the actor class, items are documents that can have their data
    // preparation methods overridden (such as prepareBaseData()).
    super.prepareData();

    if (this.type === 'weapon') {
      this._initializeTagSlots();
    }
  }

  /** @override */
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);

    // Ensure system object exists
    data.system = data.system || {};

    // Set dsid from name if not set or blank
    if (!data.system.dsid || data.system.dsid === '') {
      data.system.dsid = data.name
        ? slugify(data.name)
        : foundry.utils.randomID(16);
    }

    // Set category for ability items since they require subcategorization
    if (data.type === 'ability' && !data.system.category) {
      const abilityCategories = globalThis.DASU?.ABILITY_CATEGORIES || [
        'spell',
        'affliction',
        'restorative',
        'technique',
      ];
      data.system.category = abilityCategories[0]; // Use first category from config
    }

    // Prevent multiple class items per actor
    if (data.type === 'class' && this.actor) {
      const existingClasses = this.actor.items.filter(
        (item) => item.type === 'class'
      );
      if (existingClasses.length > 0) {
        ui.notifications.error(
          `Cannot add multiple class items. Actor already has: ${existingClasses[0].name}`
        );
        return false;
      }
    }

    // Get the parent actor from options if not on this.actor yet
    const parentActor = this.actor || options.parent;

    // Prevent multiple archetype items per daemon actor
    if (data.type === 'archetype' && parentActor?.type === 'daemon') {
      const existingArchetypes = parentActor.items.filter(
        (item) => item.type === 'archetype'
      );
      if (existingArchetypes.length > 0) {
        ui.notifications.error(
          `Cannot add multiple archetype items. Daemon already has: ${existingArchetypes[0].name}`
        );
        return false;
      }
    }

    // Prevent multiple subtype items per daemon actor
    if (data.type === 'subtype' && parentActor?.type === 'daemon') {
      const existingSubtypes = parentActor.items.filter(
        (item) => item.type === 'subtype'
      );
      if (existingSubtypes.length > 0) {
        ui.notifications.error(
          `Cannot add multiple subtype items. Daemon already has: ${existingSubtypes[0].name}`
        );
        return false;
      }
    }

    // Prevent archetype/subtype/role items on non-daemon actors
    if (
      ['archetype', 'subtype', 'role'].includes(data.type) &&
      parentActor &&
      parentActor.type !== 'daemon'
    ) {
      ui.notifications.error(
        `${
          data.type.charAt(0).toUpperCase() + data.type.slice(1)
        } items can only be added to daemon actors.`
      );
      return false;
    }
  }

  /** @override */
  async _preUpdate(changed, options, user) {
    await super._preUpdate(changed, options, user);

    // Update dsid if name changed and dsid is empty
    if (changed.name && (!this.system.dsid || this.system.dsid === '')) {
      changed.system = changed.system || {};
      changed.system.dsid = slugify(changed.name);
    }

    // Handle ability category changes
    if (changed.system?.category !== undefined) {
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

    // Define which fields are compatible between categories (shared across all ability types)
    const compatibleFields = ['damage', 'cost', 'toHit', 'aptitudes'];

    // Define category-specific fields that should be removed when switching away from that category
    const categorySpecificFields = {
      technique: [],
      spell: [],
      affliction: [],
      restorative: ['healAmount', 'healType'],
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

  _initializeTagSlots() {
    const maxSlots = this.system.maxTagSlots ?? 2;
    if (!this.system.tagSlots || typeof this.system.tagSlots !== 'object') {
      this.system.tagSlots = {};
    }
    // Add missing slots
    for (let i = 1; i <= maxSlots; i++) {
      const key = `slot${i}`;
      if (!this.system.tagSlots[key]) {
        this.system.tagSlots[key] = {
          tagId: null,
          tagName: null,
          tagUuid: null,
          rank: { current: 1, max: 1 },
        };
      }
    }
    // Remove extra slots
    for (const key of Object.keys(this.system.tagSlots)) {
      if (
        !/^slot\d+$/.test(key) ||
        parseInt(key.replace('slot', '')) > maxSlots
      ) {
        delete this.system.tagSlots[key];
      }
    }
  }

  async addTag(tagId) {
    const tag = this.actor ? this.actor.items.get(tagId) : null;
    if (!tag || tag.type !== 'tag') {
      ui.notifications.error(
        'Invalid tag or tag not found in character inventory'
      );
      return false;
    }
    const availableSlot = this.getAvailableSlot();
    if (!availableSlot) {
      ui.notifications.error('No available slots');
      return false;
    }
    await this.update({
      [`system.tagSlots.${availableSlot}.tagId`]: tagId,
    });
    ui.notifications.info(`Added ${tag.name} to weapon`);
    return true;
  }

  async addTagToSlot(tagId, slotKey) {
    const tag = this.actor ? this.actor.items.get(tagId) : null;
    if (!tag || tag.type !== 'tag') {
      ui.notifications.error(
        'Invalid tag or tag not found in character inventory'
      );
      return false;
    }
    const slot = this.system.tagSlots?.[slotKey];
    if (!slot) {
      ui.notifications.error('Invalid slot');
      return false;
    }
    if (slot.tagId) {
      ui.notifications.error('Slot is already occupied');
      return false;
    }
    // Prevent equipping the same tag in multiple slots
    const tagSlots = this.system.tagSlots || {};
    const isAlreadyEquipped = Object.entries(tagSlots).some(
      ([key, slotData]) => key !== slotKey && slotData.tagId === tagId
    );
    if (isAlreadyEquipped) {
      ui.notifications.error('This tag is already equipped in another slot');
      return false;
    }
    // Pull rank info from tag
    const tagRank = tag.system.rank || { current: 1, max: 1 };
    await this.update({
      [`system.tagSlots.${slotKey}.tagId`]: tagId,
      [`system.tagSlots.${slotKey}.tagUuid`]: tag.uuid,
      [`system.tagSlots.${slotKey}.tagName`]: tag.name,
      [`system.tagSlots.${slotKey}.rank`]: {
        current: tagRank.current,
        max: tagRank.max,
      },
    });
    // Apply tag's Active Effects
    await this._applyTagActiveEffects(tagId);
    if (this.actor) {
      this.actor.sheet?.render(false);
      Object.values(ui.windows).forEach((app) => {
        if (
          app.actor &&
          app.actor.id === this.actor.id &&
          app.document?.type === 'Actor'
        ) {
          app.render(false);
        }
      });
    }
    ui.notifications.info(
      `Added ${tag.name} to slot ${slotKey.replace('slot', '')}`
    );
    return true;
  }

  async removeTag(slotKey) {
    const slot = this.system.tagSlots?.[slotKey];
    const tagId = slot?.tagId;
    const tagName = slot?.tagName || 'Unknown Tag';
    await this.update({
      [`system.tagSlots.${slotKey}.tagId`]: null,
      [`system.tagSlots.${slotKey}.tagName`]: null,
      [`system.tagSlots.${slotKey}.tagUuid`]: null,
      [`system.tagSlots.${slotKey}.rank`]: { current: 1, max: 1 },
    });
    // Remove tag's Active Effects
    if (tagId) await this._removeTagActiveEffects(tagId);
    if (this.actor) {
      this.actor.sheet?.render(false);
      Object.values(ui.windows).forEach((app) => {
        if (
          app.actor &&
          app.actor.id === this.actor.id &&
          app.document?.type === 'Actor'
        ) {
          app.render(false);
        }
      });
    }
    ui.notifications.info(
      `Removed ${tagName} from slot ${slotKey.replace('slot', '')}`
    );
    return true;
  }

  // Apply all Active Effects from the tag item to the weapon only
  async _applyTagActiveEffects(tagId) {
    const tag = this.actor ? this.actor.items.get(tagId) : null;
    if (!tag) return;
    for (const effect of tag.effects.contents) {
      const effectData = effect.toObject();
      effectData.flags = effectData.flags || {};
      effectData.flags.dasu = {
        ...(effectData.flags.dasu || {}),
        sourceTag: tag.id,
      };
      // Always create on the weapon only; Foundry will handle transfer
      await this.createEmbeddedDocuments('ActiveEffect', [effectData]);
    }
  }

  // Remove all Active Effects from the weapon that originated from the tag
  async _removeTagActiveEffects(tagId) {
    // Remove effects from item only
    const itemEffects = this.effects.filter(
      (e) => e.flags?.dasu?.sourceTag === tagId
    );
    for (const effect of itemEffects) await effect.delete();
  }

  async updateTagRank(slotKey, newRank) {
    const slot = this.system.tagSlots?.[slotKey];
    if (!slot || !slot.tagId) return false;
    const tag = this.actor ? this.actor.items.get(slot.tagId) : null;
    if (!tag) return false;
    const maxRank = tag.system.rank?.max || 1;
    const rank = Math.max(1, Math.min(newRank, maxRank));
    await this.update({ [`system.tagSlots.${slotKey}.rank.current`]: rank });
    // TODO: Re-apply tag effects for new rank
    return true;
  }

  getAvailableSlot() {
    const slots = this.system.tagSlots || {};
    // Dynamically find the first open slot
    for (const [slotKey, slot] of Object.entries(slots)) {
      if (!slot.tagId) {
        return slotKey;
      }
    }
    return null;
  }

  getEquippedTags() {
    const slots = this.system.tagSlots || {};
    const tags = [];
    for (const [slotKey, slot] of Object.entries(slots)) {
      if (slot.tagId) {
        const tag = this.actor ? this.actor.items.get(slot.tagId) : null;
        if (tag) {
          tags.push({ slotKey, tag, rank: slot.rank });
        }
      }
    }
    return tags;
  }

  getCalculatedStats() {
    const base = {
      damage: this.system.damage,
      toHit: this.system.toHit,
    };
    // No tag effects to apply
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

    // For rollable items (weapons, abilities, tactics), open accuracy dialog
    // Restoratives now also use the accuracy dialog for targeted individuals display
    if (['weapon', 'ability', 'tactic'].includes(item.type)) {
      try {
        // Open the accuracy dialog instead of rolling immediately
        await DASUAccuracyDialog.openForItem(item, item.actor);
        return null; // Dialog handles the roll
      } catch (error) {
        console.error('DASU | Error opening accuracy dialog:', error);
        ui.notifications.error(
          `Failed to open accuracy dialog for ${item.name}: ${error.message}`
        );
        return null;
      }
    }

    // For display-type items, use the new checks system
    if (
      ['tag', 'special', 'scar', 'schema', 'feature', 'class'].includes(
        item.type
      )
    ) {
      try {
        // Check if the DASU checks system is available
        if (game.dasu?.checks) {
          // Create display data
          const displayData = {
            label: `${item.name}`,
            additionalData: {
              label: `${item.name}`,
              description: item.system.description,
              itemType: item.type,
            },
          };

          // If the item has a formula, include it as a roll
          if (this.system.formula) {
            const rollData = this.getRollData();
            const roll = new Roll(rollData.formula, rollData.actor);
            await roll.evaluate();
            displayData.roll = roll;
            displayData.additionalData.formula = rollData.formula;
          }

          // Use the display check system
          return await game.dasu.checks.display(this.actor, item, displayData);
        }
      } catch (error) {
        console.error('DASU | Error creating display check:', error);
        // Fall back to legacy system if new system fails
      }
    }

    // Fallback to legacy roll system for other item types
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

  async clearInvalidTags() {
    const tagSlots = this.system.tagSlots || {};
    const updates = {};
    let clearedCount = 0;
    for (const [slotKey, slot] of Object.entries(tagSlots)) {
      if (slot.tagId) {
        const tag = this.actor ? this.actor.items.get(slot.tagId) : null;
        if (!tag || tag.type !== 'tag') {
          updates[`system.tagSlots.${slotKey}.tagId`] = null;
          updates[`system.tagSlots.${slotKey}.tagName`] = null;
          updates[`system.tagSlots.${slotKey}.tagUuid`] = null;
          updates[`system.tagSlots.${slotKey}.rank`] = { current: 1, max: 1 };
          clearedCount++;
        }
      }
    }
    if (Object.keys(updates).length > 0) {
      await this.update(updates, { diff: false });
    }
    return clearedCount;
  }

  /**
   * Re-sync all tag effects for each slotted tag, removing and re-applying only enabled effects.
   */
  async resyncTagEffects() {
    if (!this.system?.tagSlots) return;
    for (const [slotKey, slot] of Object.entries(this.system.tagSlots)) {
      if (!slot.tagId) continue;
      // Remove all effects from this tag (on weapon only)
      await this._removeTagActiveEffects(slot.tagId);
      // Get the tag item
      const tag = this.actor ? this.actor.items.get(slot.tagId) : null;
      if (!tag) continue;
      // Only apply enabled effects
      for (const effect of tag.effects.contents) {
        if (effect.disabled) continue;
        const effectData = effect.toObject();
        effectData.flags = effectData.flags || {};
        effectData.flags.dasu = {
          ...(effectData.flags.dasu || {}),
          sourceTag: tag.id,
        };
        await this.createEmbeddedDocuments('ActiveEffect', [effectData]);
      }
    }
  }

  async delete(options = {}) {
    // If this is a tag and has a parent actor, remove it from all weapon slots and clean up effects
    if (this.type === 'tag' && this.actor) {
      // Find all weapons on the actor
      const weapons = this.actor.items.filter((i) => i.type === 'weapon');
      for (const weapon of weapons) {
        const tagSlots = weapon.system.tagSlots || {};
        for (const [slotKey, slot] of Object.entries(tagSlots)) {
          if (slot.tagId === this.id) {
            await weapon.removeTag(slotKey);
          }
        }
      }
    }
    // Proceed with normal deletion
    return super.delete(options);
  }

  /**
   * Handle restorative item rolls - show healing preparation message with application buttons
   * Restoratives use manual application rather than automatic healing
   * @param {Event} event - The originating click event (unused but kept for interface consistency)
   * @returns {Promise<ChatMessage|null>} The chat message result or null if invalid
   * @private
   */
  async _rollRestorative(event) {
    const healingType = this.system.healed?.type || 'hp';
    const baseHealingAmount = this.system.healed?.value || 0;

    if (baseHealingAmount <= 0) {
      ui.notifications.warn(
        'This restorative has no healing value configured.'
      );
      return null;
    }

    // Calculate final healing amount including attribute tick
    const finalHealingAmount =
      this._calculateRestorativeHealing(baseHealingAmount);

    const currentTargets = Array.from(game.user.targets);
    return await this._createHealingPrepMessage(
      finalHealingAmount,
      healingType,
      currentTargets,
      baseHealingAmount
    );
  }

  /**
   * Calculate restorative healing amount including attribute tick
   * @param {number} baseAmount - Base healing amount from the item
   * @returns {number} Final healing amount with attribute tick
   * @private
   */
  _calculateRestorativeHealing(baseAmount) {
    if (!this.actor) {
      return baseAmount;
    }

    // Get attribute tick - use item's governing attribute or default to POW
    const attributeTick = this.system?.govern || 'pow';

    // Get governing attribute tick value for healing bonus
    let tickValue = 1; // Default tick value
    if (this.actor.system?.attributes?.[attributeTick]?.tick) {
      tickValue = this.actor.system.attributes[attributeTick].tick;
    } else if (this.actor.system?.attributes?.[attributeTick]?.current) {
      // Fallback: calculate tick from current value (DASU: 1 tick per 5 points)
      tickValue = Math.max(
        1,
        Math.floor(this.actor.system.attributes[attributeTick].current / 5)
      );
    }

    // Calculate healing using DASU formula: Base Healing + Governing Attribute Tick
    return Math.max(0, baseAmount + tickValue);
  }

  /**
   * Create a healing preparation message with application buttons
   * Shows healing item info and provides "Apply Self" and "Apply Targeted" buttons
   * @param {number} healingAmount - Final amount of healing to apply
   * @param {string} healingType - Type of healing (hp, wp, both)
   * @param {Array} currentTargets - Currently targeted tokens (for display only)
   * @param {number} baseAmount - Base healing amount before attribute tick
   * @returns {Promise<ChatMessage>} The created chat message
   * @private
   */
  async _createHealingPrepMessage(
    healingAmount,
    healingType,
    currentTargets,
    baseAmount
  ) {
    const speaker = ChatMessage.getSpeaker({ actor: this.actor });

    // Build the content with application options
    let content = "<div class='dasu healing-prep'>";

    // Header with item info
    content += "<header class='healing-header'>";
    content += `<img src='${this.img}' alt='${this.name}' class='item-image'/>`;
    content += `<h3>${this.name}</h3>`;
    content += "<span class='item-type'>Restorative</span>";
    content += '</header>';

    // Healing info
    content += '<div class="healing-info">';
    content += '<div class="healing-amount-display">';
    content += `<span class="healing-value">${healingAmount}</span>`;
    content += `<span class="resource-type">${healingType.toUpperCase()}</span>`;
    content += '</div>';

    // Show breakdown if attribute tick was added
    if (baseAmount && healingAmount > baseAmount) {
      const attributeTick = this.system?.govern || 'pow';
      const tickValue = healingAmount - baseAmount;
      content += '<div class="healing-breakdown">';
      content += `<small>Base: ${baseAmount} + ${attributeTick.toUpperCase()} tick: ${tickValue}</small>`;
      content += '</div>';
    }

    if (this.system.description) {
      content += `<div class='healing-description'>${this.system.description}</div>`;
    }
    content += '</div>';

    // Target info
    content += "<div class='target-info'>";
    if (currentTargets.length > 0) {
      content += "<div class='current-targets'>";
      content += `<strong>Current Targets (${currentTargets.length}):</strong>`;
      for (const target of currentTargets) {
        content += `<span class='target-name clickable' data-actor-id='${
          target.actor?.id
        }'>${target.actor?.name || 'Unknown'}</span>`;
      }
      content += '</div>';
    } else {
      content += "<div class='no-targets'>No targets currently selected</div>";
    }
    content += '</div>';

    // Application buttons
    content += "<div class='healing-actions'>";
    content += `<button class='healing-action-btn apply-self' data-action='applySelf' data-item-id='${this.id}' data-amount='${healingAmount}' data-type='${healingType}'>`;
    content += "<i class='fas fa-user'></i>Apply Self";
    content += '</button>';
    content += `<button class='healing-action-btn apply-targeted' data-action='applyTargeted' data-item-id='${this.id}' data-amount='${healingAmount}' data-type='${healingType}'>`;
    content += "<i class='fas fa-crosshairs'></i>Apply Targeted";
    content += '</button>';
    content += '</div>';

    content += '</div>';

    // Create the chat message
    const chatData = {
      user: game.user.id,
      speaker: speaker,
      content: content,
      style: foundry.CONST.CHAT_MESSAGE_STYLES.OTHER,
      flags: {
        dasu: {
          healingPrep: {
            itemId: this.id,
            amount: healingAmount,
            type: healingType,
            targets: currentTargets.map((t) => ({
              actorId: t.actor?.id,
              tokenId: t.id,
              name: t.actor?.name,
            })),
          },
        },
      },
    };

    return await ChatMessage.create(chatData);
  }

  /**
   * Create a chat message for healing application results
   * Creates a summary message showing healing applied to multiple targets
   * @param {Array} results - Array of healing results
   * @param {Object} results[].targetId - Target actor ID
   * @param {Object} results[].targetName - Target actor name
   * @param {Object} results[].appliedHealing - Amount of healing actually applied
   * @param {Object} results[].healingType - Type of healing (hp, wp, both)
   * @returns {Promise<ChatMessage>} The created chat message
   * @private
   */
  async _createHealingChatMessage(results) {
    const speaker = ChatMessage.getSpeaker({ actor: this.actor });

    // Calculate totals for summary
    const totalTargets = results.length;
    const totalHealing = results.reduce(
      (sum, result) => sum + result.appliedHealing,
      0
    );
    const healingType = results[0]?.healingType || 'hp';

    // Build the content with improved structure matching damage results
    let content = "<div class='dasu healing-results'>";

    // Header with item info
    content += "<header class='healing-header'>";
    content += `<img src='${this.img}' alt='${this.name}' class='item-image'/>`;
    content += `<h3>${this.name}</h3>`;
    content += "<span class='item-type'>Restorative</span>";
    content += '</header>';

    // Individual target results
    content += "<div class='healing-targets'>";
    for (const result of results) {
      const isMaxHealing =
        result.appliedHealing === 0 && result.totalHealing > 0;
      const healingText = result.error
        ? 'Failed to apply'
        : result.appliedHealing > 0
        ? `${result.appliedHealing} ${result.healingType.toUpperCase()}`
        : isMaxHealing
        ? 'Already at maximum'
        : 'No healing';

      const targetClass = result.error
        ? 'error'
        : result.appliedHealing > 0
        ? 'success'
        : 'no-healing';

      content += `<div class='healing-target ${targetClass}'>`;
      content += "<div class='target-info'>";
      content += `<div class='target-name'>${result.targetName}</div>`;
      if (result.appliedHealing > 0) {
        content += "<div class='healing-summary'>";
        content += `<span class='healing-value'>${result.appliedHealing}</span>`;
        content += `<span class='resource-target'>${result.healingType.toUpperCase()}</span>`;
        content += '</div>';
      }
      content += '</div>';
      content += `<div class='healing-amount'>${healingText}</div>`;
      if (result.error) {
        content += `<div class='error-message'>${result.error}</div>`;
      }
      content += '</div>';
    }
    content += '</div>';

    // Description if present
    if (this.system.description) {
      content += `<div class='healing-description'>${this.system.description}</div>`;
    }

    // Summary footer (matching damage results pattern)
    content += "<div class='healing-summary-footer'>";
    content += "<div class='summary-stats'>";
    content += `<div class='total-targets'>Targets: ${totalTargets}</div>`;
    content += `<div class='total-healing'>Total: ${totalHealing} ${healingType.toUpperCase()}</div>`;
    content += '</div>';
    content += '</div>';

    content += '</div>';

    // Create the chat message
    const chatData = {
      user: game.user.id,
      speaker: speaker,
      content: content,
      style: foundry.CONST.CHAT_MESSAGE_STYLES.OTHER,
      flags: {
        dasu: {
          healingResults: results,
          sourceItem: {
            id: this.id,
            name: this.name,
            type: this.type,
          },
        },
      },
    };

    return await ChatMessage.create(chatData);
  }
}

// --- Deletion Protection for Innate Items ---
Hooks.on('preDeleteItem', (item, options, userId) => {
  console.log('[preDeleteItem] Attempting to delete item:', {
    id: item.id,
    name: item.name,
    traits: item.traits,
    flags: item.flags,
    options,
    userId,
  });
  if (
    (item.traits?.includes('innate') ||
      item.getFlag('dasu', 'grantedByLeveling')) &&
    !options.fromLevelingWizard
  ) {
    console.warn(
      '[preDeleteItem] Blocked deletion of level-granted item:',
      item.name,
      item.id
    );
    ui.notifications.warn(
      'This item is granted by leveling and must be removed via the Leveling Wizard.'
    );
    return false;
  }
  return true;
});
