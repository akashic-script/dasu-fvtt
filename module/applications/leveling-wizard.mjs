/**
 * Leveling Wizard Application
 *
 * Character progression planner for DASU system:
 * - Visualize level progression from 1 to max level
 * - Plan and assign Abilities, Schemas, and Strength of Will features
 * - Drag and drop items from compendiums into level slots
 * - Automatically grant planned items on level up
 * - Track merit requirements and progression bonuses
 *
 * Integrates with actor sheet and updates in real-time.
 */
export class LevelingWizard extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    id: 'app-dasu-leveling-wizard',
    classes: ['dasu-leveling-wizard'],
    tag: 'div',
    window: {
      title: 'DASU Leveling Wizard',
      icon: 'fas fa-level-up-alt',
      resizable: true,
    },
    position: {
      width: 800,
      height: 800,
    },
    actions: {
      scrollToCurrent: LevelingWizard.onScrollToCurrent,
      removeItem: LevelingWizard.onRemoveItem,
      levelUp: LevelingWizard.onLevelUp,
    },
  };

  static PARTS = {
    header: {
      template:
        'systems/dasu/templates/applications/leveling-wizard/header.hbs',
    },
    progression: {
      template:
        'systems/dasu/templates/applications/leveling-wizard/progression.hbs',
      scrollable: ['.levels-container'],
    },
  };

  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    this.activeTab = 'levelup'; // Default tab
    // Track wizard instances for actor updates
    if (!this.actor.levelingWizards) {
      this.actor.levelingWizards = new Set();
    }
    this.actor.levelingWizards.add(this);

    // Listen for actor updates to refresh wizard and grant planned items
    this._actorUpdateHook = Hooks.on(
      'updateActor',
      (actor, data, options, userId) => {
        if (actor.id === this.actor.id && this.rendered) {
          this.refresh();
          this._checkAndGrantLevelItems(data);
        }
      }
    );

    // Bind drag/drop handlers to avoid reference issues
    this._boundDragOver = this._onDragOver.bind(this);
    this._boundDragLeave = this._onDragLeave.bind(this);
    this._boundDrop = this._onDrop.bind(this);
  }

  /** Re-attach drag/drop event listeners to a slot after content update */
  _reattachSlotListeners(slot) {
    slot.removeEventListener('dragover', this._boundDragOver);
    slot.removeEventListener('dragleave', this._boundDragLeave);
    slot.removeEventListener('drop', this._boundDrop);

    slot.addEventListener('dragover', this._boundDragOver);
    slot.addEventListener('dragleave', this._boundDragLeave);
    slot.addEventListener('drop', this._boundDrop);
  }

  /** Set up drag and drop event listeners for all slots */
  _setupDragAndDrop() {
    setTimeout(() => {
      if (!this.element) return;

      const slots = this.element.querySelectorAll('.slot');
      slots.forEach((slot) => {
        slot.addEventListener('dragover', this._boundDragOver);
        slot.addEventListener('dragleave', this._boundDragLeave);
        slot.addEventListener('drop', this._boundDrop);
      });
    }, 100);
  }

  /** Set up click handlers to open item sheets from slot items */
  _setupSlotItemClick() {
    if (!this.element) return;

    const slotItems = this.element.querySelectorAll('.slot-item');
    slotItems.forEach((slotItem) => {
      // Remove existing listeners
      if (slotItem._dasuSlotClick) {
        slotItem.removeEventListener('click', slotItem._dasuSlotClick);
      }

      // Create click handler to open item sheet
      slotItem._dasuSlotClick = async (event) => {
        if (event.target.closest('.remove-item')) return;

        const uuid = slotItem.dataset.itemUuid;
        if (!uuid) return;

        try {
          const item = await fromUuid(uuid);
          if (item?.sheet) {
            item.sheet.render(true);
          } else {
            ui.notifications.warn('Could not find item to open.');
          }
        } catch (e) {
          ui.notifications.warn('Could not open item sheet.');
        }
      };

      slotItem.addEventListener('click', slotItem._dasuSlotClick);
    });
  }

  /** Prepare template context with actor data and level progression */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    context.actor = this.actor;
    context.system = this.actor.system;
    context.maxLevel = game.settings.get('dasu', 'maxLevel') || 30;
    context.currentLevel = this.actor.system.level || 1;
    context.actorName = this.actor.name;
    context.activeTab = this.activeTab || 'levelup';

    // Calculate progression data for all levels
    context.levels = await this._calculateLevelProgression(context.maxLevel);
    this.levels = context.levels;

    // Determine next level info and level-up eligibility
    const nextLevel = context.currentLevel + 1;
    const nextLevelData = context.levels.find((l) => l.level === nextLevel);

    context.nextLevel = nextLevel;
    context.nextLevelData = nextLevelData;
    context.canLevelUp =
      nextLevelData &&
      (this.actor.system.merit || 0) >= nextLevelData.meritRequired &&
      context.currentLevel < context.maxLevel;

    return context;
  }

  /** Override render to set up event listeners after DOM is ready */
  async render(force = false, options = {}) {
    const result = await super.render(force, options);
    this._setupDragAndDrop();
    this._setupSlotItemClick();
    // Add Manual Cleanup button handler
    const cleanupBtn = this.element.querySelector('.manual-cleanup');
    if (cleanupBtn) {
      cleanupBtn.addEventListener('click', async (event) => {
        event.preventDefault();
        // Get planned UUIDs for all types
        const levelingData = this.actor.system.levelingData || {};
        const plannedUUIDs = new Set();
        for (const uuid of Object.values(levelingData.abilities || {})) {
          if (uuid) plannedUUIDs.add(uuid);
        }
        for (const uuid of Object.values(levelingData.strengthOfWill || {})) {
          if (uuid) plannedUUIDs.add(uuid);
        }
        for (const uuid of Object.values(levelingData.schemas || {})) {
          if (uuid) plannedUUIDs.add(uuid);
        }
        // Find all orphaned innate items
        const itemsToDelete = this.actor.items.filter(
          (i) =>
            i.getFlag('dasu', 'grantedByLeveling') === true &&
            (!i.getFlag('dasu', 'levelingSource')?.uuid ||
              !plannedUUIDs.has(i.getFlag('dasu', 'levelingSource')?.uuid))
        );
        if (itemsToDelete.length === 0) {
          ui.notifications.info('No orphaned level-granted items found.');
          return;
        }
        await this.actor.deleteEmbeddedDocuments(
          'Item',
          itemsToDelete.map((i) => i.id)
        );
        ui.notifications.info(
          `Deleted ${itemsToDelete.length} orphaned level-granted items.`
        );
        if (this.actor.sheet?.render) this.actor.sheet.render(false);
        this.render(false);
      });
    }
    // Add Grant Missing Items button handler
    const grantBtn = this.element.querySelector('.grant-missing-items');
    if (grantBtn) {
      grantBtn.addEventListener('click', async (event) => {
        event.preventDefault();
        await grantMissingLevelItems(this.actor);
        ui.notifications.info(
          'Granted all missing planned items for current and lower levels.'
        );
        if (this.actor.sheet?.render) this.actor.sheet.render(false);
        this.render(false);
      });
    }
    // Add Sync Granted Items button handler
    const syncBtn = this.element.querySelector('.sync-granted-items');
    if (syncBtn) {
      syncBtn.addEventListener('click', async (event) => {
        event.preventDefault();
        await this._syncGrantedItems(this.actor);
        ui.notifications.info('Synced granted items with planned slots.');
        if (this.actor.sheet?.render) this.actor.sheet.render(false);
        this.render(false);
      });
    }

    // Tab switching logic
    if (this.element) {
      this.element.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          const tab = btn.dataset.tab;
          if (tab && tab !== this.activeTab) {
            this.activeTab = tab;
            this.render(false); // Re-render to update the tab
          }
        });
      });
    }
    return result;
  }

  /**
   * Calculate progression data for all levels including bonuses and requirements
   */
  async _calculateLevelProgression(maxLevel) {
    const levels = [];

    // Merit requirements for each level (from progression table)
    const meritRequirements = [
      0, 1, 3, 6, 10, 16, 24, 34, 46, 60, 76, 94, 114, 136, 160, 186, 214, 244,
      276, 310, 346, 384, 424, 466, 510, 556, 604, 654, 706, 760,
    ];

    // To Level requirements for each level (from progression table)
    const toLevelRequirements = [
      0, 1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34,
      36, 38, 40, 42, 44, 46, 48, 50, 52, 54,
    ];

    for (let level = 1; level <= maxLevel; level++) {
      // Calculate basic progression bonuses
      const spGained = 2; // Every level
      const totalSP = level * 2;
      const apGained = level % 2 === 1 ? 1 : 0; // Odd levels only
      const totalAP = Math.ceil(level / 2);

      // Determine special bonuses based on level progression
      const gainAbility = [4, 8, 12, 16, 22, 28].includes(level);
      const gainAptitude = [4, 9, 14, 21, 26].includes(level);
      const gainSchema = [1, 5, 10, 15, 20, 25].includes(level);
      const gainStrengthOfWill = [6, 12, 18, 24, 30].includes(level);

      // Determine schema type (first/second) based on level
      let schemaType = null;
      if (gainSchema) {
        if ([1, 5, 15, 25].includes(level)) {
          schemaType = 'first';
        } else if ([10, 20].includes(level)) {
          schemaType = 'second';
        }
      }

      // Check for assigned/planned items at this level
      const assignedSchema = await this._getAssignedSchema(schemaType);
      const assignedAbility = await this._getAssignedAbility(
        level,
        gainAbility
      );
      const assignedStrengthOfWill = await this._getAssignedStrengthOfWill(
        level,
        gainStrengthOfWill
      );

      const levelData = {
        level,
        isCurrentLevel: level === this.actor.system.level,
        isCompleted: level < this.actor.system.level,
        isFuture: level > this.actor.system.level,
        apGained,
        spGained,
        totalAP,
        totalSP,
        meritRequired: meritRequirements[level - 1] || 0,
        toLevelRequired: toLevelRequirements[level - 1] || 0,
        gainAbility,
        gainAptitude,
        gainSchema,
        gainStrengthOfWill,
        schemaType,
        assignedSchema,
        assignedAbility,
        assignedStrengthOfWill,
        bonuses: this._getLevelBonuses(
          level,
          apGained,
          spGained,
          gainAbility,
          gainAptitude,
          gainSchema,
          gainStrengthOfWill,
          schemaType
        ),
      };

      levels.push(levelData);
    }

    return levels;
  }

  /**
   * Sync granted items with planned slots
   * @param {Actor} actor - The actor to sync items for
   */
  async _syncGrantedItems(actor) {
    const levelingData = actor.system.levelingData || {};
    const plannedUUIDs = new Set();

    // Collect all planned UUIDs
    for (const uuid of Object.values(levelingData.abilities || {})) {
      if (uuid) plannedUUIDs.add(uuid);
    }
    for (const uuid of Object.values(levelingData.strengthOfWill || {})) {
      if (uuid) plannedUUIDs.add(uuid);
    }
    for (const uuid of Object.values(levelingData.schemas || {})) {
      if (uuid) plannedUUIDs.add(uuid);
    }

    // Find all granted items that don't match planned slots
    const itemsToRemove = actor.items.filter(
      (i) =>
        i.traits?.includes('innate') &&
        i.getFlag('dasu', 'grantedByLeveling') === true &&
        (!i.getFlag('dasu', 'levelingSource')?.uuid ||
          !plannedUUIDs.has(i.getFlag('dasu', 'levelingSource')?.uuid))
    );

    // Remove orphaned items
    if (itemsToRemove.length > 0) {
      await actor.deleteEmbeddedDocuments(
        'Item',
        itemsToRemove.map((i) => i.id)
      );
    }

    // Grant missing planned items
    await grantMissingLevelItems(actor);
  }

  /** Get assigned schema for a schema type (current or planned) */
  async _getAssignedSchema(schemaType) {
    if (!schemaType) return null;

    // Check current schema assignments
    const actorSchemas = this.actor.system.schemas || {};
    const assignedSchemaId = actorSchemas[schemaType];
    if (assignedSchemaId && assignedSchemaId !== '') {
      return this.actor.items.get(assignedSchemaId);
    }

    // Check planned schema assignments
    if (this.actor.system.levelingData?.schemas?.[schemaType]) {
      const plannedSchemaUUID =
        this.actor.system.levelingData.schemas[schemaType];
      try {
        const plannedSchema = await fromUuid(plannedSchemaUUID);
        if (plannedSchema) {
          return {
            name: plannedSchema.name,
            uuid: plannedSchemaUUID,
            img: plannedSchema.img,
          };
        }
      } catch (e) {
        // Schema not found, ignore
      }
    }

    return null;
  }

  /** Get assigned ability for a level (planned only) */
  async _getAssignedAbility(level, gainAbility) {
    if (!gainAbility || !this.actor.system.levelingData?.abilities?.[level]) {
      return null;
    }

    const plannedAbilityUUID = this.actor.system.levelingData.abilities[level];
    try {
      const plannedAbility = await fromUuid(plannedAbilityUUID);
      if (plannedAbility) {
        return {
          name: plannedAbility.name,
          uuid: plannedAbilityUUID,
          img: plannedAbility.img,
        };
      }
    } catch (e) {
      // Ability not found, ignore
    }

    return null;
  }

  /** Get assigned Strength of Will feature for a level (planned only) */
  async _getAssignedStrengthOfWill(level, gainStrengthOfWill) {
    if (
      !gainStrengthOfWill ||
      !this.actor.system.levelingData?.strengthOfWill?.[level]
    ) {
      return null;
    }

    const plannedFeatureUUID =
      this.actor.system.levelingData.strengthOfWill[level];
    try {
      const plannedFeature = await fromUuid(plannedFeatureUUID);
      if (plannedFeature) {
        return {
          name: plannedFeature.name,
          uuid: plannedFeatureUUID,
          img: plannedFeature.img,
        };
      }
    } catch (e) {
      // Feature not found, ignore
    }

    return null;
  }

  /** Get the bonuses for a specific level */
  _getLevelBonuses(
    level,
    apGained,
    spGained,
    gainAbility,
    gainAptitude,
    gainSchema,
    gainStrengthOfWill,
    schemaType
  ) {
    const bonuses = [];

    // SP bonus (every level)
    bonuses.push({
      type: 'sp',
      icon: 'fas fa-magic',
      text: `+${spGained} SP`,
      description: 'Skill Points',
    });

    // AP bonus (odd levels only)
    if (apGained > 0) {
      bonuses.push({
        type: 'ap',
        icon: 'fas fa-star',
        text: `+${apGained} AP`,
        description: 'Attribute Points',
      });
    }

    // Ability bonus
    if (gainAbility) {
      bonuses.push({
        type: 'ability',
        icon: 'fas fa-scroll',
        text: 'New Ability',
        description: 'Choose a new ability',
      });
    }

    // Aptitude bonus
    if (gainAptitude) {
      bonuses.push({
        type: 'aptitude',
        icon: 'fas fa-gem',
        text: 'Aptitude +1',
        description: 'Increase any aptitude by 1',
      });
    }

    // Schema bonus
    if (gainSchema) {
      const schemaText =
        schemaType === 'first' ? 'First Schema' : 'Second Schema';
      bonuses.push({
        type: 'schema',
        icon: 'fas fa-puzzle-piece',
        text: schemaText,
        description:
          schemaType === 'first' ? 'First Schema slot' : 'Second Schema slot',
      });
    }

    // Strength of Will bonus
    if (gainStrengthOfWill) {
      bonuses.push({
        type: 'strength-of-will',
        icon: 'fas fa-shield-alt',
        text: 'Strength of Will',
        description: 'New Strength of Will feature',
      });
    }

    return bonuses;
  }

  /** Refresh the leveling wizard display */
  refresh() {
    // Debounce refresh calls to improve performance
    if (this._refreshTimeout) {
      clearTimeout(this._refreshTimeout);
    }

    this._refreshTimeout = setTimeout(async () => {
      try {
        await this.render(true);
      } catch (error) {
        console.error('Error refreshing leveling wizard:', error);
      }
    }, 100);
  }

  /**
   * Clean up when the wizard is closed
   */
  async close(options = {}) {
    // Clean up event listeners to prevent memory leaks
    if (this.actor && this.actor.levelingWizards) {
      this.actor.levelingWizards.delete(this);
    }

    // Remove any bound event listeners
    if (this._boundListeners) {
      this._boundListeners.forEach((listener) => {
        if (listener.element && listener.element.removeEventListener) {
          listener.element.removeEventListener(
            listener.event,
            listener.handler
          );
        }
      });
      this._boundListeners = [];
    }

    await super.close(options);
  }

  /** Handle drag and drop functionality */
  _onDragStart(event) {
    const item = event.currentTarget;
    const itemId = item.dataset.itemId;
    const itemType = item.dataset.itemType;

    event.dataTransfer.setData(
      'text/plain',
      JSON.stringify({
        itemId: itemId,
        itemType: itemType,
        source: 'leveling-wizard',
      })
    );

    item.classList.add('dragging');
  }

  _onDragEnd(event) {
    const item = event.currentTarget;
    item.classList.remove('dragging');
  }

  _onDragOver(event) {
    event.preventDefault();
    const slot = event.currentTarget;
    slot.classList.add('drag-over');
    slot.classList.add('drag-over-' + slot.dataset.slotType);
  }

  _onDragLeave(event) {
    const slot = event.currentTarget;
    slot.classList.remove('drag-over');
    slot.classList.remove('drag-over-ability');
    slot.classList.remove('drag-over-schema');
    slot.classList.remove('drag-over-strength-of-will');
  }

  async _onDrop(event) {
    event.preventDefault();
    event.stopPropagation();

    const slot = event.currentTarget;
    if (!slot.classList.contains('slot')) {
      return;
    }

    try {
      let data;
      let itemId, itemType;
      const rawData = event.dataTransfer.getData('text/plain');
      try {
        data = JSON.parse(rawData);

        // Handle Foundry's built-in drag data (from compendium/sidebar)
        if (data.type === 'Item' && data.uuid) {
          itemId = data.uuid;
          try {
            const compendiumItem = await fromUuid(data.uuid);
            if (compendiumItem) {
              itemType = compendiumItem.type;
            } else {
              throw new Error(`Could not load item from UUID: ${data.uuid}`);
            }
          } catch (error) {
            throw new Error(
              `Could not load item from UUID: ${data.uuid} - ${error.message}`
            );
          }
        } else if (data.type === 'Item' && data._id) {
          // Sidebar/world item: get the item from the world collection
          const item = game.items.get(data._id);
          if (!item) throw new Error('Item not found in world.');
          itemId = item.uuid;
          itemType = item.type;
        } else {
          // Custom drag data
          itemId = data.itemId;
          itemType = data.itemType;
        }
      } catch (e) {
        // Fallback: try to get data from the dragged element
        const draggedElement = document.querySelector(
          '.available-item.dragging'
        );
        if (draggedElement) {
          itemId = draggedElement.dataset.itemId;
          itemType = draggedElement.dataset.itemType;
        } else {
          throw new Error('No drag data available');
        }
      }

      const slotType = slot.dataset.slotType;
      const level = parseInt(slot.dataset.level);

      // Validate the drop
      if (!this._canDropItem(itemType, slotType, level)) {
        ui.notifications.warn('Cannot drop this item type in this slot.');
        return;
      }

      // Handle the drop based on slot type
      await this._handleItemDrop(itemId, slotType, level, slot);
    } catch (error) {
      ui.notifications.error('Error handling drop. Check console for details.');
    }
  }

  /** Check if an item can be dropped in a specific slot */
  _canDropItem(itemType, slotType, level) {
    if (!itemType) return false;

    // Check item type compatibility with slot type
    switch (slotType) {
      case 'ability':
        return itemType === 'ability';
      case 'schema':
        if (itemType !== 'schema') return false;

        // Check schema progression rules
        const schemaType = this._getSchemaTypeForLevel(level);
        if (schemaType === 'second' && level < 10) {
          return false; // Can't assign second schema before level 10
        }

        // Check if schema slot is already filled
        const actorSchemas = this.actor.system.schemas || {};
        const levelingSchemas = this.actor.system.levelingData?.schemas || {};

        if (
          schemaType === 'first' &&
          (actorSchemas.first || levelingSchemas.first)
        ) {
          return false; // First schema already assigned
        }
        if (
          schemaType === 'second' &&
          (actorSchemas.second || levelingSchemas.second)
        ) {
          return false; // Second schema already assigned
        }

        return true;
      case 'strength-of-will':
        return itemType === 'feature';
      default:
        return false;
    }
  }

  /** Get the schema type (first/second) for a given level */
  _getSchemaTypeForLevel(level) {
    if ([1, 5, 15, 25].includes(level)) {
      return 'first';
    } else if ([10, 20].includes(level)) {
      return 'second';
    }
    return null;
  }

  // Static action methods
  static async onScrollToCurrent(event, target) {
    const currentLevelElement =
      this.element.querySelector('.level-row.current');
    const levelsContainer = this.element.querySelector('.levels-container');

    if (currentLevelElement && levelsContainer) {
      // Calculate scroll position to center the current level in the levels container
      const elementTop = currentLevelElement.offsetTop;
      const containerHeight = levelsContainer.clientHeight;
      const targetScrollTop = elementTop - containerHeight / 2;

      // Scroll only within the levels container
      levelsContainer.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth',
      });
    }
  }

  static async onRemoveItem(event, target) {
    event.preventDefault();
    event.stopPropagation();

    const slot = target.closest('.slot');
    const slotType = slot.dataset.slotType;
    const level = parseInt(slot.dataset.level);

    try {
      if (slotType === 'schema') {
        const schemaType = this._getSchemaTypeForLevel(level);
        if (!schemaType) {
          ui.notifications.error('Invalid schema level.');
          return;
        }
        // Remove all granted items for this slot/level
        if ((this.actor.system.level || 1) >= level) {
          // Debug: log all items and matching items

          // Loosened filter: only check type, flags, and level
          const itemsToRemove = [];
          for (const i of this.actor.items) {
            let reasons = [];
            if (i.type !== 'schema') reasons.push('type!=' + i.type);
            if (!i.getFlag('dasu', 'grantedByLeveling'))
              reasons.push('not grantedByLeveling');
            if (i.getFlag('dasu', 'levelingSource')?.level != level)
              reasons.push(
                'level!=' + i.getFlag('dasu', 'levelingSource')?.level
              );
            if (reasons.length === 0) {
              itemsToRemove.push(i);
            }
          }

          for (const item of itemsToRemove) {
            const stored =
              this.actor.system.levelingData.storedItems?.[level] || [];
            stored.push(item.toObject());
            await item.delete({ fromLevelingWizard: true });
            await this.actor.update({
              [`system.levelingData.storedItems.${level}`]: stored,
            });
          }
        }
        const updateData = {};
        updateData[`system.levelingData.schemas.${schemaType}`] = '';
        await this.actor.update(updateData);
        ui.notifications.info('Schema assignment removed.');
        if (this.actor.sheet?.render) this.actor.sheet.render(false);
        this.refresh();
      } else if (slotType === 'ability') {
        if ((this.actor.system.level || 1) >= level) {
          // Remove all granted ability items for this level
          const itemsToRemove = this.actor.items.filter(
            (i) =>
              i.getFlag('dasu', 'grantedByLeveling') === true &&
              i.getFlag('dasu', 'levelingSource')?.level == level &&
              i.type === 'ability'
          );
          for (const item of itemsToRemove) {
            const stored =
              this.actor.system.levelingData.storedItems?.[level] || [];
            stored.push(item.toObject());
            await item.delete({ fromLevelingWizard: true });
            await this.actor.update({
              [`system.levelingData.storedItems.${level}`]: stored,
            });
          }
        }
        const updateData = {};
        updateData[`system.levelingData.abilities.${level}`] = '';
        await this.actor.update(updateData);
        ui.notifications.info('Ability assignment removed.');
        if (this.actor.sheet?.render) this.actor.sheet.render(false);
        this.refresh();
      }
      if (slotType === 'strength-of-will') {
        if ((this.actor.system.level || 1) >= level) {
          // Remove all granted strengthOfWill items for this level
          const itemsToRemove = this.actor.items.filter(
            (i) =>
              i.getFlag('dasu', 'grantedByLeveling') === true &&
              i.getFlag('dasu', 'levelingSource')?.level == level &&
              i.type === 'feature'
          );
          for (const item of itemsToRemove) {
            const stored =
              this.actor.system.levelingData.storedItems?.[level] || [];
            stored.push(item.toObject());
            await item.delete({ fromLevelingWizard: true });
            await this.actor.update({
              [`system.levelingData.storedItems.${level}`]: stored,
            });
          }
        }
        const updateData = {};
        updateData[`system.levelingData.strengthOfWill.${level}`] = '';
        await this.actor.update(updateData);
        ui.notifications.info('Strength of Will assignment removed.');
        if (this.actor.sheet?.render) this.actor.sheet.render(false);
        this.refresh();
      }
    } catch (error) {
      ui.notifications.error('Error removing item. Check console for details.');
    }
  }

  static async onLevelUp(event, target) {
    event.preventDefault();
    event.stopPropagation();

    try {
      const wizard = this;
      const actor = wizard.actor;

      // Validate actor exists and is owned
      if (!actor || !actor.isOwner) {
        ui.notifications.warn(
          'You do not have permission to level up this character.'
        );
        return;
      }

      const currentLevel = actor.system.level || 1;
      const maxLevel = game.settings.get('dasu', 'maxLevel') || 30;
      const nextLevel = currentLevel + 1;

      // Validate level constraints
      if (currentLevel >= maxLevel) {
        ui.notifications.warn('You are already at the maximum level!');
        return;
      }

      // Get fresh level progression data
      const levels = await wizard._calculateLevelProgression(maxLevel);
      const nextLevelData = levels.find((l) => l.level === nextLevel);

      if (!nextLevelData) {
        ui.notifications.warn('No next level available!');
        return;
      }

      const meritRequired = nextLevelData.meritRequired;
      const currentMerit = actor.system.merit || 0;

      if (currentMerit < meritRequired) {
        ui.notifications.warn(
          `Not enough merit. Need ${meritRequired}, have ${currentMerit}.`
        );
        return;
      }

      // Perform the level up
      await actor.update({
        'system.level': nextLevel,
        'system.merit': currentMerit - meritRequired,
      });

      ui.notifications.info(`Level Up! You are now level ${nextLevel}.`);
      wizard.refresh();
    } catch (error) {
      console.error('Error in level up:', error);
      ui.notifications.error('Failed to level up. Check console for details.');
    }
  }

  async _handleItemDrop(itemId, slotType, level, slot) {
    try {
      // Validate and sanitize inputs
      if (
        !this._validateUUID(itemId) ||
        !slotType ||
        !this._validateLevel(level) ||
        !slot
      ) {
        ui.notifications.error('Invalid drop data.');
        return;
      }

      // Validate actor ownership
      if (!this.actor || !this.actor.isOwner) {
        ui.notifications.error(
          'You do not have permission to modify this character.'
        );
        return;
      }

      const item = await fromUuid(itemId);
      if (!item) {
        ui.notifications.error('Item not found.');
        return;
      }

      // Validate item type matches slot type
      if (!this._validateItemForSlot(item, slotType)) {
        ui.notifications.error(
          `Invalid item type for ${this._sanitizeInput(slotType)} slot.`
        );
        return;
      }

      // Validate level constraints
      const maxLevel = game.settings.get('dasu', 'maxLevel') || 30;
      if (level < 1 || level > maxLevel) {
        ui.notifications.error(
          `Invalid level: ${level}. Must be between 1 and ${maxLevel}.`
        );
        return;
      }

      // Always merge with latest from actor and deep clone
      const latestData = foundry.utils.deepClone(
        this.actor.system.levelingData || {}
      );
      let key;
      if (slotType === 'schema') {
        const schemaType = this._getSchemaTypeForLevel(level);
        key = `schema-${schemaType}`;
      } else if (slotType === 'ability') {
        key = `ability-${level}`;
      } else if (slotType === 'strength-of-will') {
        key = `strengthOfWill-${level}`;
      }

      if (key) {
        latestData.fullItems = latestData.fullItems || {};
        latestData.fullItems[key] = item.toObject();
      }

      // Update the relevant planned slot as well
      if (slotType === 'schema') {
        const schemaType = this._getSchemaTypeForLevel(level);
        latestData.schemas = {
          ...(latestData.schemas || {}),
          [schemaType]: itemId,
        };
      } else if (slotType === 'ability') {
        latestData.abilities = {
          ...(latestData.abilities || {}),
          [level]: itemId,
        };
      } else if (slotType === 'strength-of-will') {
        latestData.strengthOfWill = {
          ...(latestData.strengthOfWill || {}),
          [level]: itemId,
        };
      }

      const updateData = { 'system.levelingData': latestData };
      await this.actor.update(updateData);

      ui.notifications.info(
        `Assigned ${this._sanitizeInput(item.name)} as ${this._sanitizeInput(
          slotType
        )} (will be granted at level ${level}).`
      );

      // If the slotted level is current or completed, grant missing items immediately
      if (level <= (this.actor.system.level || 1)) {
        await grantMissingLevelItems(this.actor);
      }

      // Update slot visual state
      slot.classList.add('has-item');
      slot.setAttribute('data-item-uuid', itemId);
      slot.setAttribute('data-item-name', this._sanitizeInput(item.name));
      slot.innerHTML = `
        <div class="slot-item" data-item-uuid="${itemId}">
          <span class="item-name">${this._sanitizeInput(item.name)}</span>
          <button class="remove-item" data-action="removeItem" data-item-uuid="${itemId}">×</button>
        </div>
      `;
      this._reattachSlotListeners(slot);
    } catch (error) {
      console.error('Error in _handleItemDrop:', error);
      ui.notifications.error(
        'Error assigning item. Check console for details.'
      );
    }
  }

  async _checkAndGrantLevelItems(data) {
    // This method is no longer needed as level changes are handled by dasu.levelChanged hook
  }

  _validateItemForSlot(item, slotType) {
    try {
      // Validate item exists
      if (!item) return false;

      // Validate slot type
      if (!slotType || typeof slotType !== 'string') return false;

      // Check item type matches slot type
      switch (slotType) {
        case 'schema':
          return item.type === 'schema';
        case 'ability':
          return item.type === 'ability';
        case 'strength-of-will':
          return item.type === 'feature';
        default:
          return false;
      }
    } catch (error) {
      console.error('Error in _validateItemForSlot:', error);
      return false;
    }
  }

  _sanitizeInput(input) {
    if (typeof input !== 'string') return '';

    // Basic HTML sanitization
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
  }

  _validateLevel(level) {
    const numLevel = parseInt(level);
    const maxLevel = game.settings.get('dasu', 'maxLevel') || 30;
    return !isNaN(numLevel) && numLevel >= 1 && numLevel <= maxLevel;
  }

  _validateUUID(uuid) {
    if (typeof uuid !== 'string') return false;
    // Basic UUID validation (simplified)
    return uuid.length > 0 && uuid.includes('.');
  }

  _handleError(error, context = 'Unknown operation') {
    console.error(`[LevelingWizard] Error in ${context}:`, error);

    // Log additional context for debugging
    if (this.actor) {
      console.error('Actor context:', {
        id: this.actor.id,
        name: this.actor.name,
        type: this.actor.type,
        level: this.actor.system?.level,
      });
    }

    // Show user-friendly error message
    ui.notifications.error(
      `An error occurred in the leveling wizard: ${context}. Check console for details.`
    );

    // Attempt to recover gracefully
    try {
      if (this.rendered) {
        this.refresh();
      }
    } catch (refreshError) {
      console.error('Failed to refresh after error:', refreshError);
    }
  }

  async _safeOperation(operation, context = 'Unknown operation') {
    try {
      return await operation();
    } catch (error) {
      this._handleError(error, context);
      throw error;
    }
  }
}

// Helper to map actor level to schema progression level
function getSchemaProgressionLevel(actorLevel, schemaType) {
  if (schemaType === 'first') {
    if (actorLevel >= 15) return 3;
    if (actorLevel >= 5) return 2;
    if (actorLevel >= 1) return 1;
  } else if (schemaType === 'second') {
    if (actorLevel >= 25) return 3;
    if (actorLevel >= 20) return 2;
    if (actorLevel >= 10) return 1;
  }
  return 0;
}

// Trait-based Leveling Item Helpers
async function grantLevelingItem(actor, uuid, level, typeHint) {
  // For schemas, try to find an existing innate schema with the same uuid
  if (typeHint === 'schema') {
    // Find the schemaType for this level
    let schemaType = null;
    if ([1, 5, 15].includes(level)) schemaType = 'first';
    else if ([10, 20, 25].includes(level)) schemaType = 'second';
    // Find the existing innate schema for this uuid and type
    const existing = actor.items.find(
      (i) =>
        i.type === 'schema' &&
        i.getFlag('dasu', 'grantedByLeveling') === true &&
        i.getFlag('dasu', 'levelingSource')?.uuid === uuid &&
        (schemaType === null ||
          i.getFlag('dasu', 'levelingSource')?.schemaType === schemaType)
    );
    // FIX: Use the level being processed, not actor.system.level
    const progressionLevel = getSchemaProgressionLevel(level, schemaType);
    if (existing) {
      // Always set system.level to the correct progression step for this schema
      if (progressionLevel !== existing.system.level) {
        await existing.update({ 'system.level': progressionLevel });
      }
      return;
    }
  }

  // Duplicate check: ignore traits, check type, flags, level, uuid
  const matches = actor.items.filter(
    (i) =>
      (!typeHint || i.type === typeHint) &&
      i.getFlag('dasu', 'grantedByLeveling') === true &&
      i.getFlag('dasu', 'levelingSource')?.level == level &&
      i.getFlag('dasu', 'levelingSource')?.uuid === uuid
  );
  if (matches.length > 0) {
    for (let j = 1; j < matches.length; j++) {
      await matches[j].delete({ fromLevelingWizard: true });
    }
    return;
  }

  // Try to restore from storedItems
  const stored = actor.system.levelingData.storedItems?.[level] || [];
  let itemData = stored.find(
    (i) => i.flags?.dasu?.levelingSource?.uuid === uuid
  );

  if (!itemData) {
    // Try to restore from fullItems
    const fullItems = actor.system.levelingData.fullItems || {};
    let key;
    if (typeHint === 'schema') {
      // Try to find the schemaType for this uuid
      const schemaType = Object.keys(
        actor.system.levelingData.schemas || {}
      ).find((k) => actor.system.levelingData.schemas[k] === uuid);
      key = `schema-${schemaType}`;
      if (!fullItems[key]) {
        // Fallback: search all schema keys for matching level
        for (const k of Object.keys(fullItems)) {
          if (
            k.startsWith('schema-') &&
            fullItems[k]?.system?.level === level
          ) {
            key = k;
            break;
          }
        }
      }
    } else if (typeHint === 'ability') {
      key = `ability-${level}`;
    } else if (typeHint === 'feature') {
      key = `strengthOfWill-${level}`;
    }
    itemData = fullItems[key];
  }

  if (!itemData) {
    return;
  }

  // Add trait and flags
  itemData.traits = [...(itemData.traits || []), 'innate'];
  itemData.flags = itemData.flags || {};
  let schemaType = null;
  if (typeHint === 'schema') {
    if ([1, 5, 15].includes(level)) schemaType = 'first';
    else if ([10, 20, 25].includes(level)) schemaType = 'second';
  }
  itemData.flags.dasu = {
    ...itemData.flags.dasu,
    grantedByLeveling: true,
    levelingSource: { level, uuid, ...(schemaType ? { schemaType } : {}) },
    sourceUuid: uuid, // Track original source
  };
  if (typeHint === 'schema' && schemaType) {
    const progressionLevel = getSchemaProgressionLevel(level, schemaType);
    itemData.system = itemData.system || {};
    itemData.system.level = progressionLevel;
  }

  try {
    await actor.createEmbeddedDocuments('Item', [itemData]);
  } catch (error) {
    console.error('[Grant Leveling Item] Error creating item:', error);
  }
}

async function revokeLevelingItems(actor, level) {
  const itemsToRemove = actor.items.filter(
    (i) =>
      i.getFlag('dasu', 'grantedByLeveling') === true &&
      i.getFlag('dasu', 'levelingSource')?.level === level
  );
  if (!itemsToRemove.length) return;

  // Prepare storage
  const stored = actor.system.levelingData.storedItems?.[level] || [];
  for (const item of itemsToRemove) {
    stored.push(item.toObject());
    await item.delete({ fromLevelingWizard: true });
  }
  // Update storedItems
  await actor.update({ [`system.levelingData.storedItems.${level}`]: stored });
}

async function grantMissingLevelItems(actor) {
  const currentLevel = actor.system.level;
  const levelingData = actor.system.levelingData || {};

  // Abilities
  for (const [level, uuid] of Object.entries(levelingData.abilities || {})) {
    if (parseInt(level) <= currentLevel) {
      await grantLevelingItem(actor, uuid, parseInt(level), 'ability');
    }
  }
  // Schemas
  for (const [schemaType, uuid] of Object.entries(levelingData.schemas || {})) {
    let schemaLevels = { first: [1, 5, 15, 25], second: [10, 20] };
    for (const level of schemaLevels[schemaType] || []) {
      if (level <= currentLevel && uuid) {
        await grantLevelingItem(actor, uuid, level, 'schema');
      }
    }
  }
  // Strength of Will
  for (const [level, uuid] of Object.entries(
    levelingData.strengthOfWill || {}
  )) {
    if (parseInt(level) <= currentLevel && uuid) {
      await grantLevelingItem(actor, uuid, parseInt(level), 'feature');
    }
  }
  await actor.update({ 'system.levelingData': levelingData });
}

export { grantLevelingItem, revokeLevelingItems };

Hooks.on('dasu.levelChanged', async (actor, { oldLevel, newLevel }) => {
  // Only handle for DASU actors
  if (!actor || !actor.system || !actor.system.levelingData) {
    return;
  }

  const levelingData = actor.system.levelingData;
  const itemsToGrant = [];
  // Grant planned items for new level (as before)
  if (newLevel > oldLevel) {
    // Abilities
    if (levelingData.abilities?.[newLevel]) {
      await grantLevelingItem(
        actor,
        levelingData.abilities[newLevel],
        newLevel,
        'ability'
      );
      itemsToGrant.push({
        type: 'ability',
        uuid: levelingData.abilities[newLevel],
      });
      delete levelingData.abilities[newLevel];
    }
    // Strength of Will
    if (levelingData.strengthOfWill?.[newLevel]) {
      await grantLevelingItem(
        actor,
        levelingData.strengthOfWill[newLevel],
        newLevel,
        'feature'
      );
      itemsToGrant.push({
        type: 'feature',
        uuid: levelingData.strengthOfWill[newLevel],
      });
      delete levelingData.strengthOfWill[newLevel];
    }
    // Schemas
    const schemaType =
      typeof actor._getSchemaTypeForLevel === 'function'
        ? actor._getSchemaTypeForLevel(newLevel)
        : typeof LevelingWizard?.prototype?._getSchemaTypeForLevel ===
          'function'
        ? LevelingWizard.prototype._getSchemaTypeForLevel.call(
            { actor },
            newLevel
          )
        : null;
    if (schemaType && levelingData.schemas?.[schemaType]) {
      await grantLevelingItem(
        actor,
        levelingData.schemas[schemaType],
        newLevel,
        'schema'
      );
      itemsToGrant.push({
        type: 'schema',
        uuid: levelingData.schemas[schemaType],
      });
      delete levelingData.schemas[schemaType];
    }
    if (itemsToGrant.length > 0) {
      await actor.update({ 'system.levelingData': levelingData });
      ui.notifications.info(`Granted planned items at level ${newLevel}.`);
    }
  }
  // Revoke all items for levels above newLevel using only dasu flags
  const itemsToRemove = actor.items.filter(
    (i) =>
      i.getFlag('dasu', 'grantedByLeveling') === true &&
      i.getFlag('dasu', 'levelingSource')?.level > newLevel
  );
  for (const item of itemsToRemove) {
    const level = item.getFlag('dasu', 'levelingSource')?.level;
    const stored = actor.system.levelingData.storedItems?.[level] || [];
    stored.push(item.toObject());
    await item.delete({ fromLevelingWizard: true });
    await actor.update({
      [`system.levelingData.storedItems.${level}`]: stored,
    });
  }
  if (itemsToRemove.length > 0) {
    ui.notifications.info(`Revoked items from levels above ${newLevel}.`);
  }
  // Always grant any missing planned items for current and lower levels
  await grantMissingLevelItems(actor);
  // Refresh wizard if open for this actor
  if (actor.levelingWizards) {
    for (const wizard of actor.levelingWizards) {
      if (wizard.rendered) wizard.refresh();
    }
  }
});
