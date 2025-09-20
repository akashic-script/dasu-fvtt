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
import DASUConfig from '../helpers/config.mjs';
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
      toggleSkillExpand: LevelingWizard.onToggleSkillExpand,
      toggleAttributeExpand: LevelingWizard.onToggleAttributeExpand,
      increaseSkill: LevelingWizard.onIncreaseSkill,
      decreaseSkill: LevelingWizard.onDecreaseSkill,
      increaseAttribute: LevelingWizard.onIncreaseAttribute,
      decreaseAttribute: LevelingWizard.onDecreaseAttribute,
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
          // Only refresh if significant changes occurred (not point allocations)
          if (this._shouldRefreshOnUpdate(data)) {
            this.refresh();
          }
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

    // First prepare skill options that will be needed in the template
    const skillSelectOptions = await this._prepareSkillSelectOptions();

    // Calculate progression data for all levels
    context.levels = await this._calculateLevelProgression(context.maxLevel);
    this.levels = context.levels;

    // Add skillSelectOptions to each level for easier template access
    context.levels.forEach((level) => {
      // Filter out skills that are already allocated for this level
      const allocatedSkills = new Set(
        Object.keys(level.pointAllocations?.sp?.skills || {})
      );
      level.skillSelectOptions = skillSelectOptions.filter(
        (skill) => !allocatedSkills.has(skill.value)
      );
    });

    // Determine next level info and level-up eligibility
    const nextLevel = context.currentLevel + 1;
    const nextLevelData = context.levels.find((l) => l.level === nextLevel);

    context.nextLevel = nextLevel;
    context.nextLevelData = nextLevelData;
    context.canLevelUp =
      nextLevelData &&
      (this.actor.system.merit || 0) >= nextLevelData.meritRequired &&
      context.currentLevel < context.maxLevel;

    // Add configuration data for point allocation
    context.config = {
      attributes: {
        pow: { label: 'Power' },
        dex: { label: 'Dexterity' },
        will: { label: 'Will' },
        sta: { label: 'Stamina' },
      },
      allSkills: skillSelectOptions,
    };

    // Keep skillSelectOptions on root context for backwards compatibility
    context.skillSelectOptions = skillSelectOptions;

    // Add class progression info from _calculateLevelProgression
    context.hasClass = this._hasClass || false;
    context.hasClassProgression = this._hasClassProgression || false;

    return context;
  }

  /**
   * Prepare skill select options for dropdowns
   * @returns {Array} Array of skill options in selectOptions format
   */
  async _prepareSkillSelectOptions() {
    // Get all skills (core + custom), ensuring core skills are always available

    const coreSkills = DASUConfig.CORE_SKILLS || [];

    let actorSkills;
    try {
      actorSkills = this.actor.getAllSkills() || [];
    } catch (error) {
      console.error(
        'DASU Leveling Wizard - Error getting actor skills:',
        error
      );
      actorSkills = [];
    }

    // Create a combined list, prioritizing actor's version of skills if they exist
    const skillMap = new Map();

    // Add core skills first
    coreSkills.forEach((coreSkill) => {
      // Ensure we have valid data for core skills
      if (coreSkill && coreSkill.id && coreSkill.name) {
        skillMap.set(coreSkill.id, {
          value: coreSkill.id, // selectOptions uses 'value' for the option value (use ID)
          label: `${coreSkill.name}`, // selectOptions uses 'label' for display text
          isCore: true,
        });
      }
    });

    // Add/override with actor's skills (both core and custom)
    actorSkills.forEach((actorSkill) => {
      // Ensure we have valid data for actor skills
      if (actorSkill && actorSkill.id && actorSkill.name) {
        const isCore = actorSkill.isCore || false;
        skillMap.set(actorSkill.id, {
          value: actorSkill.id, // Use ID for value instead of name
          label: isCore ? `${actorSkill.name}` : actorSkill.name,
          isCore: isCore,
        });
      }
    });

    // Convert to array and sort
    const skillArray = Array.from(skillMap.values()).sort((a, b) => {
      // Sort core skills first, then alphabetically
      if (a.isCore && !b.isCore) return -1;
      if (!a.isCore && b.isCore) return 1;
      return (a.label || '').localeCompare(b.label || '');
    });

    // Convert to selectOptions format - using array format as per Foundry docs
    // Array format: [{value: "value1", label: "Label 1"}]
    const skillSelectOptions = [];

    skillArray.forEach((skill) => {
      // Only add skills with valid value and label
      if (skill && skill.value && skill.label) {
        skillSelectOptions.push({
          value: skill.value,
          label: skill.label,
        });
      }
    });

    // Final validation

    // Ensure it's never null or undefined and always an array
    if (!Array.isArray(skillSelectOptions)) {
      return [];
    }

    return skillSelectOptions;
  }

  /** Override render to set up event listeners after DOM is ready */
  async render(force = false, options = {}) {
    const result = await super.render(force, options);

    // Only set up event listeners once
    if (!this._eventListenersSetup) {
      this._setupAllEventHandlers();
      this._eventListenersSetup = true;
    }

    this._setupDragAndDrop();
    this._setupSlotItemClick();

    return result;
  }

  /**
   * Set up all event handlers once
   */
  _setupAllEventHandlers() {
    this._setupPointAllocationHandlers();
    this._setupButtonHandlers();
    this._setupTabHandlers();
  }

  /**
   * Set up button event handlers using delegation
   */
  _setupButtonHandlers() {
    this.element.addEventListener('click', async (event) => {
      if (event.target.classList.contains('manual-cleanup')) {
        event.preventDefault();
        await this._handleCleanup();
      } else if (event.target.classList.contains('grant-missing-items')) {
        event.preventDefault();
        await this._handleGrantMissing();
      } else if (event.target.classList.contains('sync-granted-items')) {
        event.preventDefault();
        await this._handleSyncGranted();
      }
    });
  }

  /**
   * Set up tab switching handlers
   */
  _setupTabHandlers() {
    this.element.addEventListener('click', (event) => {
      if (event.target.classList.contains('tab-btn')) {
        const tab = event.target.dataset.tab;
        if (tab && tab !== this.activeTab) {
          this.activeTab = tab;
          this._updateTabDisplay();
        }
      }
    });
  }

  /**
   * Update tab display without full re-render
   */
  _updateTabDisplay() {
    // Update tab buttons
    this.element.querySelectorAll('.tab-btn').forEach((btn) => {
      if (btn.dataset.tab === this.activeTab) {
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
      }
    });

    // Re-render only if needed for tab content switching
    this.render(false);
  }

  /**
   * Handle cleanup button click
   */
  async _handleCleanup() {
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
    this._refreshSheetIfOpen();
  }

  /**
   * Handle grant missing items button click
   */
  async _handleGrantMissing() {
    await grantMissingLevelItems(this.actor);
    ui.notifications.info(
      'Granted all missing planned items for current and lower levels.'
    );
    this._refreshSheetIfOpen();
  }

  /**
   * Handle sync granted items button click
   */
  async _handleSyncGranted() {
    await this._syncGrantedItems(this.actor);
    ui.notifications.info('Synced granted items with planned slots.');
    this._refreshSheetIfOpen();
  }

  /**
   * Refresh actor sheet if open
   */
  _refreshSheetIfOpen() {
    if (this.actor.sheet?.rendered) {
      this.actor.sheet.render(false);
    }
  }

  /**
   * Determine if we should refresh on actor update
   */
  _shouldRefreshOnUpdate(updateData) {
    // Don't refresh for point allocation changes (we handle those specially)
    if (updateData['system.levelingData']?.pointAllocations) {
      return false;
    }

    // Refresh for level changes, item changes, or other significant updates
    return !!(
      updateData['system.level'] ||
      updateData['system.merit'] ||
      updateData['system.experience'] ||
      updateData['system.levelingData']?.abilities ||
      updateData['system.levelingData']?.schemas ||
      updateData['system.levelingData']?.strengthOfWill ||
      updateData['items']
    );
  }

  /**
   * Set up event handlers for point allocation controls
   */
  _setupPointAllocationHandlers() {
    // Simplified - most actions now handled by ApplicationV2 action system
    // Only keeping essential dropdown handler
    if (!this.element) return;

    this.element.addEventListener('change', (event) => {
      if (event.target.classList.contains('skill-add-dropdown')) {
        this._addSkillAllocation(event.target);
      }
    });
  }

  /**
   * Unified handler for point allocation changes
   */
  async _handleAttributeChange(button, delta) {
    await this._handlePointAllocationChange(button, delta, 'ap');
  }

  /**
   * Unified expand/collapse toggle handler
   */
  _handleExpandToggle(button, type) {
    const level = parseInt(button.dataset.level);
    const levelRow = this.element.querySelector(`[data-level="${level}"]`);
    if (!levelRow) return;

    const collapsed = levelRow.querySelector(`.${type}-allocations-collapsed`);
    const expanded = levelRow.querySelector(`.${type}-allocations-expanded`);
    const toggleIcon = button.querySelector('i');

    const isExpanded = collapsed.style.display === 'none';
    collapsed.style.display = isExpanded ? '' : 'none';
    expanded.style.display = isExpanded ? 'none' : '';
    toggleIcon.className = `fas fa-chevron-${isExpanded ? 'down' : 'up'}`;
    button.title = `Show ${isExpanded ? 'all' : 'only allocated'} ${type}s`;
  }

  async _handleSkillExpandToggle(button) {
    this._handleExpandToggle(button, 'skill');
  }

  async _handleAttributeExpandToggle(button) {
    this._handleExpandToggle(button, 'attribute');
  }

  /**
   * Unified handler for skill allocation changes
   */
  async _handleSkillChange(button, delta) {
    await this._handlePointAllocationChange(button, delta, 'sp');
  }

  /**
   * Unified handler for all point allocation changes
   */
  async _handlePointAllocationChange(button, delta, forceType = null) {
    const level = parseInt(button.dataset.level);
    const pointType = forceType || button.dataset.pointType;
    const target = button.dataset.attribute || button.dataset.skill;

    if (isNaN(level) || level < 1) {
      ui.notifications.error('Invalid level data');
      return;
    }

    const currentValue = this._getCurrentAllocation(level, pointType, target);
    let newValue = Math.max(0, currentValue + delta);

    // Skills are limited to 1 point each
    if (pointType === 'sp' && newValue > 1) {
      ui.notifications.warn(
        'Skills can only have 1 point allocated per level.'
      );
      return;
    }

    // Check available points for increases
    if (delta > 0) {
      const levelData = this.levels?.find((l) => l.level === level);
      const available =
        pointType === 'ap'
          ? levelData?.apGained || 0
          : levelData?.spGained || 0;
      const currentTotal =
        pointType === 'ap'
          ? this._getTotalAPAllocated(level)
          : this._getTotalSPAllocated(level);

      if (currentTotal >= available) {
        ui.notifications.warn(
          `No ${pointType.toUpperCase()} available at level ${level}.`
        );
        return;
      }
    }

    await this._updatePointAllocation(
      level,
      pointType,
      target,
      newValue,
      pointType === 'sp'
    );

    if (pointType === 'sp') {
      await this._applyAllSkillAllocations();
    }

    // Force full render if removing allocation to update collapsed view
    if (newValue === 0) {
      this.levels = null;
      await this.render(true);
    }
  }

  /**
   * Handle direct point input changes
   */
  async _handleDirectPointInput(input) {
    const level = parseInt(input.dataset.level);
    const pointType = input.dataset.pointType;
    const attribute = input.dataset.attribute;
    const skill = input.dataset.skill;
    let newValue = Math.max(0, parseInt(input.value) || 0);
    const target = attribute || skill;

    // For skills, limit to maximum 1 point per level
    if (pointType === 'sp' && skill && newValue > 1) {
      newValue = 1;
      input.value = newValue;
      ui.notifications.warn(
        'You can only allocate 1 point per skill per level.'
      );
    }

    // For AP, validate against available points
    if (pointType === 'ap') {
      const levelData = this.levels?.find((l) => l.level === level);
      const availableAP = levelData?.apGained || 0;

      if (availableAP > 0) {
        const currentValue = this._getCurrentAllocation(
          level,
          pointType,
          target
        );
        const currentTotal = this._getTotalAPAllocated(level);
        const targetChange = newValue - currentValue;

        if (currentTotal + targetChange > availableAP) {
          const maxAllowable = availableAP - (currentTotal - currentValue);
          newValue = Math.max(0, maxAllowable);
          input.value = newValue;
          ui.notifications.warn(
            `Cannot allocate more AP. Only ${availableAP} AP available at level ${level}.`
          );
        }
      }
    }

    // For SP, validate against available points
    if (pointType === 'sp') {
      const levelData = this.levels?.find((l) => l.level === level);
      const availableSP = levelData?.spGained || 0;

      if (availableSP > 0) {
        const currentValue = this._getCurrentAllocation(
          level,
          pointType,
          target
        );
        const currentTotal = this._getTotalSPAllocated(level);
        const targetChange = newValue - currentValue;

        if (currentTotal + targetChange > availableSP) {
          const maxAllowable = Math.min(
            1,
            availableSP - (currentTotal - currentValue)
          ); // Skills still limited to 1
          newValue = Math.max(0, maxAllowable);
          input.value = newValue;
          ui.notifications.warn(
            `Cannot allocate more SP. Only ${availableSP} SP available at level ${level}.`
          );
        }
      }
    }

    await this._updatePointAllocation(level, pointType, target, newValue);
  }

  /**
   * Handle skill addition input (compact UI)
   */
  _handleSkillAdd(input) {
    // For future: implement autocomplete/suggestions
    // Current: just prepare for Enter key
  }

  /**
   * Add a new skill allocation
   */
  async _addSkillAllocation(dropdown) {
    const level = parseInt(dropdown.dataset.level);
    const skillName = dropdown.value.trim();

    if (!skillName) return;

    // Check if skill is already allocated for this level
    const currentValue = this._getCurrentAllocation(level, 'sp', skillName);
    if (currentValue > 0) {
      ui.notifications.warn(
        `${skillName} is already allocated for level ${level}. You can only allocate 1 point per skill per level.`
      );
      dropdown.value = '';
      return;
    }

    // Check if SP allocation would exceed available points
    const levelData = this.levels?.find((l) => l.level === level);
    const availableSP = levelData?.spGained || 0;

    if (availableSP > 0) {
      const currentTotal = this._getTotalSPAllocated(level);

      if (currentTotal + 1 > availableSP) {
        ui.notifications.warn(
          `Cannot allocate more SP. Only ${availableSP} SP available at level ${level}.`
        );
        dropdown.value = '';
        return;
      }
    }

    await this._updatePointAllocation(level, 'sp', skillName, 1);
    dropdown.value = '';
  }

  /**
   * Get current allocation for a point type and target
   */
  _getCurrentAllocation(level, pointType, target) {
    const levelingData = this.actor.system.levelingData || {};
    const pointAllocations = levelingData.pointAllocations || {};
    const levelData = pointAllocations[level] || {};

    if (pointType === 'ap') {
      return levelData.ap?.[target] || 0;
    } else if (pointType === 'sp') {
      const value = levelData.sp?.skills?.[target] || 0;
      return value;
    }

    return 0;
  }

  /**
   * Get total AP allocated for a level
   */
  _getTotalAPAllocated(level) {
    const levelingData = this.actor.system.levelingData || {};
    const pointAllocations = levelingData.pointAllocations || {};
    const levelData = pointAllocations[level] || {};
    const apAllocations = levelData.ap || {};

    return Object.values(apAllocations).reduce(
      (sum, points) => sum + (points || 0),
      0
    );
  }

  /**
   * Get total SP allocated for a level
   */
  _getTotalSPAllocated(level) {
    const levelingData = this.actor.system.levelingData || {};
    const pointAllocations = levelingData.pointAllocations || {};
    const levelData = pointAllocations[level] || {};
    const spAllocations = levelData.sp?.skills || {};

    return Object.values(spAllocations).reduce(
      (sum, points) => sum + (points || 0),
      0
    );
  }

  /**
   * Update point allocation in actor data
   */
  async _updatePointAllocation(
    level,
    pointType,
    target,
    value,
    skipRender = false
  ) {
    if (isNaN(level) || level < 1) return;
    if (this._updating) return;
    this._updating = true;

    try {
      // Use targeted update to avoid schema reinitialization
      let updateData;
      if (pointType === 'ap') {
        updateData = {
          [`system.levelingData.pointAllocations.${level}.ap.${target}`]: value,
        };
      } else if (pointType === 'sp') {
        updateData =
          value === 0
            ? {
                [`system.levelingData.pointAllocations.${level}.sp.skills.-=${target}`]:
                  null,
              }
            : {
                [`system.levelingData.pointAllocations.${level}.sp.skills.${target}`]:
                  value,
              };
      }

      await this.actor.update(updateData);
      await new Promise((resolve) => setTimeout(resolve, 50));

      if (!skipRender) {
        this._queueRender(pointType === 'sp' && value === 0);
      }
    } finally {
      this._updating = false;
    }
  }

  /**
   * Handle skill removal button click
   */
  async _handleSkillRemove(button) {
    let level = parseInt(button.dataset.level);
    const skillName = button.dataset.skill;

    // If level is NaN, try to get it from the parent level-row element
    if (!level) {
      const levelRow = button.closest('.level-row');
      if (levelRow) {
        level = parseInt(levelRow.dataset.level);
      }
    }

    if (!level || !skillName) {
      console.error('Invalid skill remove data:', {
        level,
        skillName,
        buttonLevel: button.dataset.level,
        parentLevel: button.closest('.level-row')?.dataset.level,
      });
      return;
    }

    // Confirm removal
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: 'Remove Skill Allocation',
      },
      content: `<p>Are you sure you want to remove the allocation for <strong>${skillName}</strong> at level ${level}?</p>
                <p>This will free up the skill points for reallocation.</p>`,
      modal: true,
      rejectClose: false,
    });

    if (!confirmed) return;

    try {
      // Remove the skill allocation and from actor skills
      await this._updatePointAllocation(level, 'sp', skillName, 0, true);

      // Simple refresh
      this.levels = null;
      await this.render();

      ui.notifications.info(
        `Removed skill allocation for ${skillName} at level ${level}.`
      );
    } catch (error) {
      console.error('Error removing skill allocation:', error);
      ui.notifications.error('Failed to remove skill allocation.');
    }
  }

  /**
   * Queue a render to happen at most once per animation frame
   */
  _queueRender(forceFullRender = false) {
    if (this._renderQueued) return;
    this._renderQueued = true;

    requestAnimationFrame(() => {
      this._renderQueued = false;
      this.render(forceFullRender);
    });
  }

  /**
   * Get class progression data from actor's class items
   * @returns {Object} Progression data organized by level
   */
  _getClassProgression() {
    const progression = {};

    // Find class items on the actor
    const classItems = this.actor.items.filter((item) => item.type === 'class');

    for (const classItem of classItems) {
      const levelSlots = classItem.system.levelSlots || {};

      // Process each level's slots
      for (const [level, slots] of Object.entries(levelSlots)) {
        const levelNum = parseInt(level);
        if (!progression[levelNum]) {
          progression[levelNum] = {
            abilities: [],
            aptitudes: [],
            schemas: [],
            strengthOfWill: [],
            features: [],
            skills: [],
            attributes: [],
          };
        }

        // Process each slot in this level
        for (const slot of slots) {
          if (typeof slot === 'string') {
            // Simple slot type
            if (slot === 'ability')
              progression[levelNum].abilities.push({ type: 'ability' });
            else if (slot === 'aptitude')
              progression[levelNum].aptitudes.push({ type: 'aptitude' });
            else if (slot === 'schema')
              progression[levelNum].schemas.push({ type: 'schema' });
            else if (slot === 'feature')
              progression[levelNum].strengthOfWill.push({ type: 'feature' });
            else if (slot === 'skill')
              progression[levelNum].skills.push({ type: 'skill' });
            else if (slot === 'attribute')
              progression[levelNum].attributes.push({ type: 'attribute' });
          } else if (typeof slot === 'object' && slot.type) {
            // Enhanced slot type (schema with details)
            if (slot.type === 'schema') {
              progression[levelNum].schemas.push({
                type: 'schema',
                schemaId: slot.schemaId,
                action: slot.action,
              });
            } else if (slot.type === 'ability') {
              progression[levelNum].abilities.push(slot);
            } else if (slot.type === 'feature') {
              progression[levelNum].strengthOfWill.push(slot);
            }
            // Add other enhanced slot types as needed
          }
        }
      }
    }

    return progression;
  }

  /**
   * Evaluate a class progression formula
   * @param {string} formula - The formula to evaluate
   * @param {number} level - The character level
   * @returns {number} - The calculated value
   */
  _evaluateFormula(formula, level) {
    try {
      // Handle special formula formats
      if (formula.includes('odd:')) {
        const match = formula.match(/odd:(\d+)-(\d+)/);
        if (match) {
          const start = parseInt(match[1]);
          const end = parseInt(match[2]);
          return level >= start && level <= end && level % 2 === 1 ? 1 : 0;
        }
      }

      if (formula.includes('even:')) {
        const match = formula.match(/even:(\d+)-(\d+)/);
        if (match) {
          const start = parseInt(match[1]);
          const end = parseInt(match[2]);
          return level >= start && level <= end && level % 2 === 0 ? 1 : 0;
        }
      }

      // Replace 'level' with actual level value and evaluate
      const expression = formula.replace(/level/g, level.toString());

      // Simple evaluation for basic mathematical expressions
      // Only allow numbers, operators, and parentheses for security
      if (!/^[0-9+\-*/()\s]+$/.test(expression)) {
        console.warn('Invalid formula expression:', expression);
        return 0;
      }

      return Math.floor(eval(expression));
    } catch (error) {
      console.error('Error evaluating formula:', formula, error);
      return 0;
    }
  }

  /**
   * Get point allocation data for a specific level
   * @param {number} level - The character level
   * @param {number} apGained - AP gained at this level
   * @param {number} spGained - SP gained at this level
   * @returns {Object} Point allocation data
   */
  _getPointAllocations(level, apGained, spGained) {
    const levelingData = this.actor.system.levelingData || {};
    const pointAllocations = levelingData.pointAllocations || {};
    const levelData = pointAllocations[level] || {};

    // Initialize default structure
    const result = {
      ap: {
        pow: levelData.ap?.pow || 0,
        dex: levelData.ap?.dex || 0,
        will: levelData.ap?.will || 0,
        sta: levelData.ap?.sta || 0,
        spent: 0,
        available: apGained,
        locked: level < this.actor.system.level,
      },
      sp: {
        skills: levelData.sp?.skills || {},
        spent: 0,
        available: spGained,
        locked: level < this.actor.system.level,
      },
    };

    // Calculate spent points
    result.ap.spent =
      result.ap.pow + result.ap.dex + result.ap.will + result.ap.sta;
    result.sp.spent = Object.values(result.sp.skills).reduce(
      (sum, points) => sum + points,
      0
    );

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

    // Get class progression data
    const classProgression = this._getClassProgression();
    const classItems = this.actor.items.filter((item) => item.type === 'class');
    const hasClass = classItems.length > 0;

    // Check if class has meaningful progression data
    const hasClassProgression =
      hasClass &&
      classItems.some((classItem) => {
        const levelSlots = classItem.system.levelSlots || {};
        const progression = classItem.system.progression || {};

        // Class has progression if it has level slots OR progression formulas
        const hasLevelSlots = Object.keys(levelSlots).length > 0;
        const hasProgressionFormulas =
          progression.apFormula ||
          progression.spFormula ||
          (progression.customFormulas &&
            Object.keys(progression.customFormulas).length > 0);

        return hasLevelSlots || hasProgressionFormulas;
      });

    // Store class info for use in _prepareContext
    this._hasClass = hasClass;
    this._hasClassProgression = hasClassProgression;

    for (let level = 1; level <= maxLevel; level++) {
      // Calculate progression bonuses - use class formulas if available, otherwise defaults
      let spGained = 2; // Default: every level
      let apGained = level % 2 === 1 ? 1 : 0; // Default: odd levels only

      // Use class progression formulas if available
      if (hasClassProgression && classItems.length > 0) {
        const classItem = classItems[0]; // Use first class item
        if (classItem.system.progression?.spFormula) {
          try {
            // Try actor method first, fallback to our own implementation
            if (typeof this.actor.evaluateClassFormula === 'function') {
              spGained = this.actor.evaluateClassFormula(
                classItem.system.progression.spFormula,
                level
              );
            } else {
              spGained = this._evaluateFormula(
                classItem.system.progression.spFormula,
                level
              );
            }
          } catch (e) {
            console.warn('Failed to evaluate SP formula, using default:', e);
          }
        }
        if (classItem.system.progression?.apFormula) {
          try {
            // Try actor method first, fallback to our own implementation
            if (typeof this.actor.evaluateClassFormula === 'function') {
              apGained = this.actor.evaluateClassFormula(
                classItem.system.progression.apFormula,
                level
              );
            } else {
              apGained = this._evaluateFormula(
                classItem.system.progression.apFormula,
                level
              );
            }
          } catch (e) {
            console.warn('Failed to evaluate AP formula, using default:', e);
          }
        }
      }

      const totalSP = level * 2; // Keep legacy calculation for now
      const totalAP = Math.ceil(level / 2); // Keep legacy calculation for now

      // Get class-based progression for this level
      const classLevelData = classProgression[level] || {};

      // Determine special bonuses - only use class data if actor has a class
      let gainAbility, gainAptitude, gainSchema, gainStrengthOfWill;

      if (hasClass) {
        // Use class-based progression from levelSlots
        gainAbility = classLevelData.abilities?.length > 0;
        gainAptitude = classLevelData.aptitudes?.length > 0;
        gainSchema = classLevelData.schemas?.length > 0;
        gainStrengthOfWill = classLevelData.strengthOfWill?.length > 0;

        // If no levelSlots data but class has progression, check levelBonuses
        if (
          !gainAbility &&
          !gainAptitude &&
          !gainSchema &&
          !gainStrengthOfWill &&
          hasClassProgression &&
          classItems.length > 0
        ) {
          const classItem = classItems[0];
          const levelBonuses = classItem.system.levelBonuses || [];

          // Check if this level has any bonuses defined
          for (const bonus of levelBonuses) {
            const bonusLevels = Array.isArray(bonus.level)
              ? bonus.level
              : [bonus.level];
            if (bonusLevels.includes(level)) {
              if (bonus.type === 'ability') gainAbility = true;
              if (bonus.type === 'aptitude') gainAptitude = true;
              if (bonus.type === 'schema') gainSchema = true;
              if (bonus.type === 'strengthOfWill' || bonus.type === 'feature')
                gainStrengthOfWill = true;
            }
          }
        }
      } else {
        // No class = no progression slots
        gainAbility = false;
        gainAptitude = false;
        gainSchema = false;
        gainStrengthOfWill = false;
      }

      // Enhanced schema information from class
      let schemaType = null;
      let schemaDetails = null;
      if (gainSchema) {
        if (hasClass && classLevelData.schemas?.length > 0) {
          schemaDetails = classLevelData.schemas[0]; // Take first schema slot for this level
          if (schemaDetails.type === 'schema') {
            // For enhanced schemas, we still need to determine first/second for assignment lookup
            // This maps class-based schema progression to the traditional schema types
            if ([1, 5, 15, 25].includes(level)) {
              schemaType = 'first';
            } else if ([10, 20].includes(level)) {
              schemaType = 'second';
            } else {
              // For custom levels, try to infer from existing assignments or default to first
              const hasFirstSchema =
                this.actor.system.levelingData?.schemas?.first;
              const hasSecondSchema =
                this.actor.system.levelingData?.schemas?.second;
              schemaType = !hasFirstSchema
                ? 'first'
                : !hasSecondSchema
                ? 'second'
                : 'first';
            }
          }
        } else if (!hasClass) {
          // Fallback to hardcoded schema type logic only if no class
          if ([1, 5, 15, 25].includes(level)) {
            schemaType = 'first';
          } else if ([10, 20].includes(level)) {
            schemaType = 'second';
          }
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

      // Get point allocation data for this level
      const pointAllocations = this._getPointAllocations(
        level,
        apGained,
        spGained
      );

      // Ensure level is available in pointAllocations context
      pointAllocations.level = level;

      const actorLevel = this.actor.system.level || 1;

      const levelData = {
        level,
        isCurrentLevel: level === actorLevel,
        isCompleted: level < actorLevel,
        isFuture: level > actorLevel,
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
        schemaDetails,
        assignedSchema,
        assignedAbility,
        assignedStrengthOfWill,
        pointAllocations,
        bonuses: this._getLevelBonuses(
          level,
          apGained,
          spGained,
          gainAbility,
          gainAptitude,
          gainSchema,
          gainStrengthOfWill,
          schemaType,
          schemaDetails
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
    schemaType,
    schemaDetails
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
      let schemaText = 'Schema';
      let schemaDescription = 'Schema slot';

      if (schemaDetails) {
        // Use enhanced schema details from class
        if (schemaDetails.schemaId) {
          schemaText = `${
            schemaDetails.action === 'upgrade' ? 'Upgrade' : 'New'
          } ${schemaDetails.schemaId}`;
          schemaDescription = `${
            schemaDetails.action === 'upgrade' ? 'Upgrade existing' : 'New'
          } schema: ${schemaDetails.schemaId}`;
        } else {
          schemaText = `${
            schemaDetails.action === 'upgrade' ? 'Schema Upgrade' : 'New Schema'
          }`;
          schemaDescription = `${
            schemaDetails.action === 'upgrade'
              ? 'Upgrade existing schema level'
              : 'New schema slot'
          }`;
        }
      } else if (schemaType) {
        // Fallback to old schema type logic
        schemaText = schemaType === 'first' ? 'First Schema' : 'Second Schema';
        schemaDescription =
          schemaType === 'first' ? 'First Schema slot' : 'Second Schema slot';
      }

      bonuses.push({
        type: 'schema',
        icon: 'fas fa-puzzle-piece',
        text: schemaText,
        description: schemaDescription,
        schemaDetails: schemaDetails,
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

    // Remove hook
    if (this._actorUpdateHook) {
      Hooks.off('updateActor', this._actorUpdateHook);
      this._actorUpdateHook = null;
    }

    // Cancel any queued renders
    if (this._renderQueued) {
      this._renderQueued = false;
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
        ui.notifications.warn(game.i18n.localize('DASU.NoPermissionToModify'));
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

  static async onOpenSkillDialog(event, target) {
    event.preventDefault();
    event.stopPropagation();

    const level = parseInt(target.dataset.level);
    const wizard = this;

    try {
      await wizard._openSkillAllocationDialog(level);
    } catch (error) {
      console.error('Error opening skill dialog:', error);
      ui.notifications.error('Failed to open skill allocation dialog.');
    }
  }

  static async onRemoveSkill(event, target) {
    event.preventDefault();
    event.stopPropagation();

    const wizard = this;
    await wizard._handleSkillRemove(target);
  }

  static async onIncreaseAttribute(event, target) {
    event.preventDefault();
    event.stopPropagation();

    const wizard = this;
    await wizard._handleAttributeChange(target, 1);
  }

  static async onDecreaseAttribute(event, target) {
    event.preventDefault();
    event.stopPropagation();

    const wizard = this;
    await wizard._handleAttributeChange(target, -1);
  }

  static async onToggleSkillExpand(event, target) {
    event.preventDefault();
    event.stopPropagation();

    const wizard = this;
    await wizard._handleSkillExpandToggle(target);
  }

  static async onToggleAttributeExpand(event, target) {
    event.preventDefault();
    event.stopPropagation();

    const wizard = this;
    await wizard._handleAttributeExpandToggle(target);
  }

  static async onIncreaseSkill(event, target) {
    event.preventDefault();
    event.stopPropagation();

    const wizard = this;
    await wizard._handleSkillChange(target, 1);
  }

  static async onDecreaseSkill(event, target) {
    event.preventDefault();
    event.stopPropagation();

    const wizard = this;
    await wizard._handleSkillChange(target, -1);
  }

  static async onApplySkillAllocations(event, target) {
    event.preventDefault();
    event.stopPropagation();

    const wizard = this;

    try {
      await wizard._applyAllSkillAllocations();
      ui.notifications.info('Applied all skill allocations to character.');
    } catch (error) {
      console.error('Error applying skill allocations:', error);
      ui.notifications.error('Failed to apply skill allocations.');
    }
  }

  /**
   * Open skill allocation dialog for a specific level
   * @param {number} level - The level to allocate skills for
   */
  async _openSkillAllocationDialog(level) {
    // Refresh level data to ensure we have the latest allocations
    const maxLevel = game.settings.get('dasu', 'maxLevel') || 30;
    const freshLevels = await this._calculateLevelProgression(maxLevel);
    const levelData = freshLevels?.find((l) => l.level === level);

    if (!levelData) {
      ui.notifications.error(`Invalid level: ${level}`);
      return;
    }

    const availableSP = levelData.spGained || 0;
    const currentTotal = this._getTotalSPAllocated(level);
    const remainingSP = availableSP - currentTotal;

    if (remainingSP <= 0) {
      ui.notifications.warn(
        `No skill points available to allocate at level ${level}.`
      );
      return;
    }

    // Get all available skills and filter out already allocated ones
    const allSkillOptions = await this._prepareSkillSelectOptions();
    const allocatedSkills = new Set(
      Object.keys(levelData.pointAllocations?.sp?.skills || {})
    );
    const availableSkills = allSkillOptions.filter(
      (skill) => !allocatedSkills.has(skill.value)
    );

    if (availableSkills.length === 0) {
      ui.notifications.warn('No skills available to allocate.');
      return;
    }

    // Create dialog content
    const maxSelections = Math.min(remainingSP, 2); // Up to 2 skills or remaining SP

    // Add custom CSS and script to the dialog content
    const style = `
      <style>
        .skill-allocation-dialog .skill-checkboxes {
          max-height: 300px;
          overflow-y: auto;
          margin: 10px 0;
        }
        .skill-allocation-dialog .skill-option {
          display: block;
          margin: 5px 0;
          padding: 5px;
          border: 1px solid #ccc;
          border-radius: 3px;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .skill-allocation-dialog .skill-option:hover {
          background-color: #f0f0f0;
        }
        .skill-allocation-dialog .skill-option input {
          margin-right: 8px;
        }
        .skill-allocation-dialog .skill-option input:disabled + span {
          color: #999;
        }
      </style>
      <script>
        setTimeout(function() {
          const checkboxes = document.querySelectorAll('input[name="selectedSkills"]');
          const maxSelections = ${maxSelections};

          checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
              const selected = document.querySelectorAll('input[name="selectedSkills"]:checked');
              if (selected.length >= maxSelections) {
                checkboxes.forEach(cb => {
                  if (!cb.checked) {
                    cb.disabled = true;
                    cb.closest('.skill-option').style.opacity = '0.5';
                  }
                });
              } else {
                checkboxes.forEach(cb => {
                  cb.disabled = false;
                  cb.closest('.skill-option').style.opacity = '1';
                });
              }
            });
          });
        }, 100);
      </script>
    `;

    const content =
      style +
      `
      <div class="skill-allocation-dialog">
        <p><strong>Level ${level} Skill Allocation</strong></p>
        <p>Available Skill Points: ${remainingSP}</p>
        <p>Select up to ${maxSelections} skill${
        maxSelections > 1 ? 's' : ''
      } to increase by 1 tick:</p>
        <div class="skill-checkboxes">
          ${availableSkills
            .map(
              (skill) => `
            <label class="skill-option">
              <input type="checkbox" name="selectedSkills" value="${skill.value}" data-label="${skill.label}">
              <span>${skill.label}</span>
            </label>
          `
            )
            .join('')}
        </div>
      </div>
    `;

    // Store reference to wizard for callback
    const wizard = this;

    // Create and show dialog using DialogV2
    const dialog = await foundry.applications.api.DialogV2.prompt({
      window: {
        title: `Allocate Skills - Level ${level}`,
        icon: 'fas fa-magic',
        resizable: true,
      },
      content,
      modal: true,
      buttons: [
        {
          action: 'allocate',
          icon: 'fas fa-check',
          label: 'Allocate Skills',
          default: true,
          callback: async (event, button, dialog) => {
            // Get selected skills from checkboxes
            const checkboxes = dialog.element.querySelectorAll(
              'input[name="selectedSkills"]:checked'
            );
            const selectedSkills = Array.from(checkboxes).map((cb) => cb.value);

            if (selectedSkills.length === 0) {
              ui.notifications.warn('Please select at least one skill.');
              return false; // Keep dialog open
            }

            if (selectedSkills.length > maxSelections) {
              ui.notifications.warn(
                `You can only select up to ${maxSelections} skill${
                  maxSelections > 1 ? 's' : ''
                }.`
              );
              return false; // Keep dialog open
            }

            // Allocate the selected skills using the wizard instance
            try {
              await wizard._allocateSelectedSkills(level, selectedSkills);
              ui.notifications.info(
                `Allocated ${selectedSkills.length} skill point${
                  selectedSkills.length > 1 ? 's' : ''
                }.`
              );
              return true; // Close dialog
            } catch (error) {
              console.error('Error allocating skills:', error);
              ui.notifications.error('Failed to allocate skills.');
              return false; // Keep dialog open
            }
          },
        },
        {
          action: 'cancel',
          icon: 'fas fa-times',
          label: 'Cancel',
        },
      ],
    });
  }

  /**
   * Allocate selected skills for a level
   * @param {number} level - The level to allocate for
   * @param {string[]} selectedSkills - Array of skill names to allocate
   */
  async _allocateSelectedSkills(level, selectedSkills) {
    try {
      for (const skillName of selectedSkills) {
        await this._updatePointAllocation(level, 'sp', skillName, 1, true);
      }

      // Final render after all allocations - force full render to show new skills
      this._queueRender(true);

      // Check if we need to update the actual actor skills (not just leveling data)
      const currentLevel = this.actor.system.level || 1;

      // Always apply skill allocations immediately (for current design)
      await this._applySkillAllocationsToActor(level, selectedSkills);

      if (level > currentLevel) {
        ui.notifications.info(
          `Skills allocated for future level ${level} and applied immediately.`
        );
      }

      ui.notifications.info(
        `Allocated 1 point to ${selectedSkills.length} skill${
          selectedSkills.length > 1 ? 's' : ''
        } at level ${level}.`
      );
    } catch (error) {
      console.error('Error allocating skills:', error);
      ui.notifications.error(
        'Failed to allocate skills. Check console for details.'
      );
    }
  }

  /**
   * Apply skill allocations to the actual actor skills (not just leveling data)
   */
  async _applySkillAllocationsToActor(level, skillNames) {
    try {
      const actorData = foundry.utils.deepClone(this.actor.system);
      let updated = false;

      for (const skillName of skillNames) {
        // Find the skill in the actor's skills array
        const skillIndex = actorData.skills?.findIndex(
          (skill) => skill.name === skillName
        );

        if (skillIndex !== -1) {
          actorData.skills[skillIndex].ticks =
            (actorData.skills[skillIndex].ticks || 0) + 1;
          updated = true;
        } else {
          console.warn(
            `DASU Leveling Wizard - Skill not found in actor skills: ${skillName}`
          );
        }
      }

      if (updated) {
        await this.actor.update({ 'system.skills': actorData.skills });

        // Refresh the actor sheet if it's open
        if (this.actor.sheet?.rendered) {
          this.actor.sheet.render(false);
        }
      }
    } catch (error) {
      console.error('Error applying skill allocations to actor:', error);
    }
  }

  /**
   * Apply all skill allocations from leveling data to actual actor skills
   */
  async _applyAllSkillAllocations() {
    try {
      const levelingData = this.actor.system.levelingData || {};
      const pointAllocations = levelingData.pointAllocations || {};

      const actorData = foundry.utils.deepClone(this.actor.system);
      let updated = false;

      // First, reset all skill ticks to 0 (or their base value)
      if (actorData.skills) {
        for (const skill of actorData.skills) {
          const originalTicks = skill.ticks || 0;
          skill.ticks = 0; // Reset to base
          if (originalTicks !== 0) {
            updated = true;
          }
        }
      }

      // Migrate old name-based skill allocations to ID-based (backward compatibility)
      for (const [level, allocations] of Object.entries(pointAllocations)) {
        if (allocations.sp?.skills) {
          const skillAllocations = allocations.sp.skills;
          const migratedSkills = {};
          let needsMigration = false;

          for (const [key, points] of Object.entries(skillAllocations)) {
            // Check if this is a name-based allocation (contains spaces or capitals)
            const skill = actorData.skills?.find((s) => s.name === key);
            if (skill && skill.id !== key) {
              // This is a name-based allocation, convert to ID
              migratedSkills[skill.id] = points;
              needsMigration = true;
            } else {
              // This is already ID-based or not found
              migratedSkills[key] = points;
            }
          }

          if (needsMigration) {
            allocations.sp.skills = migratedSkills;
          }
        }
      }

      // Process all levels
      for (const [level, allocations] of Object.entries(pointAllocations)) {
        if (level === 'NaN') continue; // Skip invalid level

        const skillAllocations = allocations.sp?.skills || {};

        for (const [skillId, points] of Object.entries(skillAllocations)) {
          if (points > 0) {
            // Find the skill in the actor's skills array by ID
            const skillIndex = actorData.skills?.findIndex(
              (skill) => skill.id === skillId
            );

            if (skillIndex !== -1) {
              actorData.skills[skillIndex].ticks =
                (actorData.skills[skillIndex].ticks || 0) + points;
              updated = true;
            } else {
              console.warn(
                `DASU Leveling Wizard - Skill not found in actor skills: ${skillId}`
              );
            }
          }
        }
      }

      if (updated) {
        await this.actor.update({ 'system.skills': actorData.skills });

        // Refresh the actor sheet if it's open
        if (this.actor.sheet?.rendered) {
          this.actor.sheet.render(false);
        }
      }
    } catch (error) {
      console.error('Error applying all skill allocations:', error);
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
        ui.notifications.error(game.i18n.localize('DASU.NoPermissionToModify'));
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
    if (existing) {
      // Schema item already exists, progression handled by class data
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
    // Schema progression level is now handled by class data
    itemData.system = itemData.system || {};
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
