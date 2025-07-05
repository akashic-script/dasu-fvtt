import { prepareActiveEffectCategories } from '../helpers/effects.mjs';
import { DASUSettings } from '../settings.mjs';
import { registerHandlebarsHelpers } from '../helpers/helpers.mjs';
import { LevelingWizard } from '../applications/leveling-wizard.mjs';

registerHandlebarsHelpers();

const { api, sheets } = foundry.applications;
const { mergeObject } = foundry.utils;

/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheetV2}
 */
export class DASUActorSheet extends api.HandlebarsApplicationMixin(
  sheets.ActorSheetV2
) {
  constructor(...args) {
    super(...args);
    this._typeFilterState = null;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ['dasu', 'actor'],
    position: {
      width: 700,
      height: 950,
    },
    actions: {
      onEditImage: this._onEditImage,
      viewDoc: this._viewDoc,
      createDoc: this._createDoc,
      copyDoc: this._copyDoc,
      deleteDoc: this._deleteDoc,
      toggleEffect: this._toggleEffect,
      toggleSummoned: this._toggleSummoned,
      removeFromStock: this._removeFromStock,
      roll: this._onRoll,
      levelUp: this._levelUp,
      increaseAttribute: this._increaseAttribute,
      decreaseAttribute: this._decreaseAttribute,
      openLevelingWizard: this._openLevelingWizard,
      rollInitiative: this._rollInitiative,
    },
    // Custom property that's merged into `this.options`
    // dragDrop: [{ dragSelector: '.draggable', dropSelector: null }],
    form: {
      submitOnChange: false,
    },
  };

  /** @override */
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, this.DEFAULT_OPTIONS);
  }

  /** @override */
  static PARTS = {
    header: {
      template: 'systems/dasu/templates/actor/header.hbs',
    },
    tabs: {
      // Foundry-provided generic template
      template: 'templates/generic/tab-navigation.hbs',
    },
    main: {
      template: 'systems/dasu/templates/actor/main.hbs',
      scrollable: [''],
    },
    biography: {
      template: 'systems/dasu/templates/actor/biography.hbs',
      scrollable: [''],
    },
    stocks: {
      template: 'systems/dasu/templates/actor/stocks.hbs',
      scrollable: [''],
    },
    items: {
      template: 'systems/dasu/templates/actor/items.hbs',
      scrollable: [''],
    },
    effects: {
      template: 'systems/dasu/templates/actor/effects.hbs',
      scrollable: [''],
    },
  };

  /** @override */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    // Not all parts always render
    options.parts = ['header', 'tabs'];
    // Don't show the other tabs if only limited view
    if (this.document.limited) return;
    // Control which parts show based on document subtype
    switch (this.document.type) {
      case 'summoner':
        options.parts.push('main', 'stocks', 'items', 'biography', 'effects');
        break;
      case 'daemon':
        options.parts.push('main', 'items', 'biography', 'effects');
        break;
    }
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    // Output initialization
    const context = {
      editable: this.isEditable,
      owner: this.document.isOwner,
      limited: this.document.limited,
      actor: this.actor,
      system: this.actor.system,
      flags: this.actor.flags,
      config: globalThis.DASU,
      maxLevel: DASUSettings.getMaxLevel(),
      tabs: this._getTabs(options.parts),
      fields: this.document.schema.fields,
      systemFields: this.document.system.schema.fields,
      isEditMode: this._isEditMode(),
    };

    // Calculate AP and ticks (derived, not stored)
    const startingAP = game.settings.get('dasu', 'startingAP');
    const level = context.system.level ?? 1;
    const startingTicks = 4;
    const totalTicks = Object.values(context.system.attributes).reduce(
      (sum, attr) => sum + (attr.tick ?? 1),
      0
    );

    // Use formula-based AP calculation
    const apFormula = game.settings.get('dasu', 'apFormula') || 'odd:1-29';
    const apEarned = startingAP + globalThis.DASU.calculateAP(level, apFormula);
    const apSpent = totalTicks - startingTicks;
    const apUnspent = apEarned - apSpent;

    // Debug AP calculation
    // console.log('AP Debug:', {
    //   startingAP,
    //   apPerLevelUp,
    //   level,
    //   totalTicks,
    //   apEarned,
    //   apSpent,
    //   apUnspent,
    // });

    context.apEarned = apEarned;
    context.apSpent = apSpent;
    context.apUnspent = apUnspent;
    context.totalTicks = totalTicks;

    await this._prepareItems(context);
    return context;
  }

  /** @override */
  async _preparePartContext(partId, context) {
    switch (partId) {
      case 'main':
      case 'stocks':
        context.tab = context.tabs[partId];
        break;
      case 'items':
        context.tab = context.tabs[partId];
        // Add filter state to context for conditional rendering
        context.itemFilterState =
          this.actor.getFlag('dasu', 'itemFilterState') || null;
        break;
      case 'biography':
        context.tab = context.tabs[partId];
        // Enrich biography info for display
        // Enrichment turns text like `[[/r 1d20]]` into buttons
        context.enrichedBiography =
          await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            this.actor.system.biography || '',
            {
              // Whether to show secret blocks in the finished html
              secrets: this.document.isOwner,
              // Data to fill in for inline rolls
              rollData: this.actor.getRollData(),
              // Relative UUID resolution
              relativeTo: this.actor,
            }
          );
        break;
      case 'effects':
        context.tab = context.tabs[partId];
        // Prepare active effects
        context.effects = prepareActiveEffectCategories(
          // A generator that returns all effects stored on the actor
          // as well as any items
          this.actor.allApplicableEffects()
        );
        break;
    }
    return context;
  }

  /**
   * Generates the data for the generic tab navigation template
   * @param {string[]} parts An array of named template parts to render
   * @returns {Record<string, Partial<ApplicationTab>>}
   * @protected
   */
  _getTabs(parts) {
    // If you have sub-tabs this is necessary to change
    const tabGroup = 'primary';
    // Default tab for first time it's rendered this session
    if (!this.tabGroups[tabGroup]) this.tabGroups[tabGroup] = 'main';
    return parts.reduce((tabs, partId) => {
      const tab = {
        cssClass: '',
        group: tabGroup,
        // Matches tab property to
        id: '',
        // FontAwesome Icon, if you so choose
        icon: '',
        // Run through localization
        label: 'DASU.Actor.Tabs.',
      };
      switch (partId) {
        case 'header':
        case 'tabs':
          return tabs;
        case 'main':
          tab.id = 'main';
          tab.label += 'Main';
          break;
        case 'stocks':
          tab.id = 'stocks';
          tab.label += 'Stocks';
          break;
        case 'biography':
          tab.id = 'biography';
          tab.label += 'Biography';
          break;
        case 'items':
          tab.id = 'items';
          tab.label += 'Items';
          break;
        case 'effects':
          tab.id = 'effects';
          tab.label += 'Effects';
          break;
      }
      if (this.tabGroups[tabGroup] === tab.id) tab.cssClass = 'active';
      tabs[partId] = tab;
      return tabs;
    }, {});
  }

  /**
   * Get the header buttons for the actor sheet
   * @returns {ApplicationHeaderButton[]}
   * @protected
   */
  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();
    if (this.isEditable) {
      const isEditMode = this._isEditMode();
      buttons.unshift({
        label: isEditMode
          ? 'DASU.Actor.EditMode.View'
          : 'DASU.Actor.EditMode.Edit',
        class: `toggle-edit-mode ${isEditMode ? 'active' : ''}`,
        icon: isEditMode ? 'fas fa-eye' : 'fas fa-edit',
        onclick: () => this._toggleEditMode(),
      });
      // Add Manual Cleanup button
      buttons.unshift({
        label: 'Manual Cleanup',
        class: 'manual-cleanup',
        icon: 'fas fa-broom',
        onclick: () => this._manualCleanup(),
      });
    }
    return buttons;
  }

  async _manualCleanup() {
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
        i.traits?.includes('innate') &&
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
    this.render(false);
  }

  /**
   * Toggle edit mode for the actor sheet
   * @protected
   */
  async _toggleEditMode() {
    const currentMode = this._isEditMode();
    const newMode = !currentMode;

    await this.document.setFlag('dasu', 'editMode', newMode);

    // Re-render the sheet to update the UI
    await this.render();
  }

  /**
   * Check if the sheet is in edit mode
   * @returns {boolean}
   * @protected
   */
  _isEditMode() {
    return this.document.getFlag('dasu', 'editMode') !== false;
  }

  /**
   * Organize and classify Items for Actor sheets.
   *
   * @param {object} context The context object to mutate
   */
  async _prepareItems(context) {
    // Initialize containers.
    // You can just use `this.document.itemTypes` instead
    // if you don't need to subdivide a given type like
    // this sheet does with spells
    const weapons = [];
    const tags = [];
    const techniques = [];
    const spells = [];
    const afflictions = [];
    const restoratives = [];
    const tactics = [];
    const specials = [];
    const scars = [];
    const schemas = [];
    const features = [];

    // Iterate through items, allocating to containers
    for (let i of this.document.items) {
      // Append to abilities.
      if (i.type === 'ability') {
        // Handle different ability categories
        if (i.system.category === 'spell') {
          // Spells are now abilities with category "spell"
          spells.push(i);
        } else if (i.system.category === 'affliction') {
          afflictions.push(i);
        } else if (i.system.category === 'restorative') {
          restoratives.push(i);
        } else if (i.system.category === 'technique') {
          techniques.push(i);
        }
        // Note: General abilities (no category) are not displayed in the items tab
        // They would be shown in the main tab if needed
      }
      // Append to weapons.
      else if (i.type === 'weapon') {
        weapons.push(i);
      }
      // Append to tags.
      else if (i.type === 'tag') {
        tags.push(i);
      }
      // Append to tactics.
      else if (i.type === 'tactic') {
        tactics.push(i);
      }
      // Append to specials (only for summoners, not daemons).
      else if (i.type === 'special' && this.document.type !== 'daemon') {
        specials.push(i);
      }
      // Append to scars (only for summoners, not daemons).
      else if (i.type === 'scar' && this.document.type !== 'daemon') {
        scars.push(i);
      } else if (i.type === 'schema') {
        schemas.push(i);
      } else if (i.type === 'feature') {
        features.push(i);
      }
    }

    // Sort then assign
    context.weapons = weapons.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    context.tags = tags.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    context.techniques = techniques.sort(
      (a, b) => (a.sort || 0) - (b.sort || 0)
    );
    context.spells = spells.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    context.afflictions = afflictions.sort(
      (a, b) => (a.sort || 0) - (b.sort || 0)
    );
    context.restoratives = restoratives.sort(
      (a, b) => (a.sort || 0) - (b.sort || 0)
    );
    context.tactics = tactics.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    context.specials = specials.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    context.scars = scars.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    context.schemas = schemas.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    context.features = features.sort((a, b) => (a.sort || 0) - (b.sort || 0));

    // Prepare daemons for summoners
    if (this.document.type === 'summoner') {
      // Get daemons from the stocks field
      const stocks = this.document.system.stocks || [];
      const daemons = [];

      for (const stock of stocks) {
        if (stock.references?.actor) {
          const actor = game.actors.get(stock.references.actor);
          if (actor && actor.type === 'daemon') {
            daemons.push({
              _id: actor.id,
              name: actor.name,
              img: actor.img,
              type: actor.type,
              isSummoned: stock.references.isSummoned || false,
            });
          }
        }
      }

      context.daemons = daemons.sort((a, b) =>
        (a.name || '').localeCompare(b.name || '')
      );

      // Prepare summoned daemons for the main tab
      context.summonedDaemons = daemons
        .filter((daemon) => daemon.isSummoned)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      // Add collapse state for summoned daemons
      context.summonedDaemonsCollapsed =
        (await this.document.getFlag('dasu', 'summonedDaemonsCollapsed')) !==
        false;

      // Prepare skills for summoners
      let skills = this.document.system.skills || [];

      // Initialize default skills if none exist or if they have empty names
      if (
        skills.length === 0 ||
        skills.some((skill) => !skill.name || !skill.id)
      ) {
        const SummonerDataModel = CONFIG.Actor.dataModels.summoner;
        const defaultSkills = SummonerDataModel.getDefaultSkills();
        await this.document.update({ 'system.skills': defaultSkills });
        skills = defaultSkills;
      }

      // Calculate skill points AFTER skills are initialized
      const level = this.document.system.level || 1;
      const SummonerDataModel = CONFIG.Actor.dataModels.summoner;
      const skillPointsData = SummonerDataModel.getSkillPointsData(
        level,
        skills
      );

      // Add skill points data to context for template
      context.skillPoints = skillPointsData;
      context.skills = skills;

      // Calculate skill costs for tooltips (cumulative: 0+1+2+3+4+5+6 = 21 SP for 6 ticks)
      const skillCosts = {};
      skillCosts[0] = 0;
      for (let i = 1; i <= 6; i++) {
        // Calculate cumulative cost: 0+1+2+...+i
        skillCosts[i] = (i * (i + 1)) / 2; // Sum of 1 to i
      }
      context.skillCosts = skillCosts;
    } else {
      context.daemons = [];
      context.skills = [];
    }

    // Calculate attribute incremental costs for the current progression
    if (['daemon', 'summoner'].includes(this.document.type)) {
      context.attributeCosts = {};
      const dataModel = this.document.system;
      for (let i = 1; i <= 6; i++) {
        // Incremental cost to go from tick i-1 to i
        const prev = dataModel.getTotalAPForTick
          ? dataModel.getTotalAPForTick(i - 1)
          : ((i - 1) * i) / 2;
        const curr = dataModel.getTotalAPForTick
          ? dataModel.getTotalAPForTick(i)
          : (i * (i + 1)) / 2;
        context.attributeCosts[i] = curr - prev;
      }
    }
  }

  /**
   * Actions performed after any render of the Application.
   * Post-render steps are not awaited by the render process.
   * @param {ApplicationRenderContext} context      Prepared context data
   * @param {RenderOptions} options                 Provided render options
   * @protected
   * @override
   */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#disableOverrides();
    this._initializeFilterState();

    // Add click handlers for skill radio buttons
    this.element.querySelectorAll('.skill-tick-radio').forEach((radio) => {
      // Remove any existing listeners to prevent duplicates
      radio.removeEventListener('click', this._handleSkillRadioClick);
      radio.removeEventListener('change', this._handleSkillRadioChange);
      radio.removeEventListener(
        'contextmenu',
        this._handleSkillRadioRightClick
      );

      // Add new listeners
      radio.addEventListener('click', this._handleSkillRadioClick.bind(this));
      radio.addEventListener('change', this._handleSkillRadioChange.bind(this));
      radio.addEventListener(
        'contextmenu',
        this._handleSkillRadioRightClick.bind(this)
      );
    });

    // Add change handlers for other form fields
    this.element
      .querySelectorAll('input[data-dtype], select[data-dtype]')
      .forEach((input) => {
        // Skip radio buttons as they're handled separately
        if (input.type === 'radio') return;

        // Remove any existing listeners to prevent duplicates
        input.removeEventListener('change', this._handleManualSubmit);
        input.removeEventListener('blur', this._handleManualSubmit);

        // Add new listeners
        input.addEventListener('change', this._handleManualSubmit.bind(this));
        input.addEventListener('blur', this._handleManualSubmit.bind(this));
      });

    // Add form submit handler
    const form = this.element.querySelector('form');
    if (form) {
      form.removeEventListener('submit', this._handleFormSubmit);
      form.addEventListener('submit', this._handleFormSubmit.bind(this));
    }

    // Add collapse/expand handlers for item headers
    this.element.querySelectorAll('.items-header').forEach((header) => {
      header.removeEventListener('click', this._handleItemHeaderClick);
      header.addEventListener('click', this._handleItemHeaderClick.bind(this));
    });
    // Add collapse/expand handler for summoned daemons
    this.element
      .querySelectorAll('[data-action="toggleSummonedDaemons"]')
      .forEach((header) => {
        header.removeEventListener(
          'click',
          this._handleSummonedDaemonsHeaderClick
        );
        header.addEventListener(
          'click',
          this._handleSummonedDaemonsHeaderClick.bind(this)
        );
      });

    // Set up items event listeners (search, filter, dropdown, etc.)
    this._setupItemsEventListeners();
  }

  /**
   * Handle skill radio button right-click events (reset to 0)
   * @param {Event} event The contextmenu event
   * @private
   */
  async _handleSkillRadioRightClick(event) {
    // Prevent default context menu
    event.preventDefault();
    event.stopPropagation();

    const skillIndex = parseInt(event.target.dataset.skillIndex);

    try {
      // Get current skills array
      const currentSkills = [...this.actor.system.skills];

      // Reset the specific skill to 0 ticks
      if (currentSkills[skillIndex]) {
        currentSkills[skillIndex] = {
          ...currentSkills[skillIndex],
          ticks: 0,
        };
      }

      // Update the entire skills array
      await this.actor.update({ 'system.skills': currentSkills });

      // Force a re-render to show the updated values
      this.render(true);
    } catch (error) {
      console.error('Error resetting skill ticks:', error);
    }
  }

  /**
   * Handle skill radio button click events
   * @param {Event} event The click event
   * @private
   */
  _handleSkillRadioClick(event) {
    // Prevent any interference with the radio button selection
    event.stopPropagation();
    event.preventDefault();

    // Force the radio button to be checked
    event.target.checked = true;

    // Manually trigger the change event
    const changeEvent = new Event('change', { bubbles: true });
    event.target.dispatchEvent(changeEvent);
  }

  /**
   * Handle skill radio button change events
   * @param {Event} event The change event
   * @private
   */
  async _handleSkillRadioChange(event) {
    // Prevent form submission
    event.stopPropagation();
    event.preventDefault();

    // Only proceed if the radio is actually checked
    if (!event.target.checked) {
      return;
    }

    // Manually update the actor data
    const skillIndex = parseInt(event.target.dataset.skillIndex);
    const tickValue = parseInt(event.target.value);

    try {
      // Get current skills array
      const currentSkills = [...this.actor.system.skills];

      // Update the specific skill
      if (currentSkills[skillIndex]) {
        currentSkills[skillIndex] = {
          ...currentSkills[skillIndex],
          ticks: tickValue,
        };
      }

      // Update the entire skills array
      await this.actor.update({ 'system.skills': currentSkills });

      // Force a re-render to show the updated values
      this.render(true);
    } catch (error) {
      console.error('Error updating skill ticks:', error);
    }
  }

  /**
   * Handle form submission
   * @param {SubmitEvent} event The form submit event
   * @private
   */
  async _handleFormSubmit(event) {
    // Prevent default form submission
    event.preventDefault();

    // Get form data
    const formData = new FormData(event.target);
    const submitData = {};

    for (const [key, value] of formData.entries()) {
      // Skip radio buttons as they're handled separately
      if (key.includes('skill-tick-radio')) continue;

      // Convert value based on data type
      const input = event.target.querySelector(`[name="${key}"]`);
      const fieldType = input?.dataset.dtype || 'String';

      let processedValue = value;
      if (fieldType === 'Number') {
        processedValue = parseFloat(value) || 0;
      } else if (fieldType === 'Boolean') {
        processedValue = value === 'true';
      }

      submitData[key] = processedValue;
    }

    // Update the actor
    try {
      await this.actor.update(submitData);
      // Refresh any open leveling wizards for this actor
      this._refreshLevelingWizards();
    } catch (error) {
      console.error('Error updating form data:', error);
    }
  }

  /**
   * Handle item header click events for collapse/expand functionality
   * @param {Event} event The click event
   * @private
   */
  _handleItemHeaderClick(event) {
    // Don't trigger if clicking on the create button
    if (event.target.closest('.item-control')) {
      return;
    }

    const header = event.currentTarget;
    const itemType = header.dataset.itemType;
    const itemList = header.nextElementSibling;

    if (itemList && itemList.classList.contains('item-list')) {
      // Toggle collapsed state
      header.classList.toggle('collapsed');
      itemList.classList.toggle('collapsed');
    }
  }

  /**
   * Handle filter button click
   * @param {Event} event The click event
   * @private
   */
  _handleFilterBtnClick(event) {
    event.stopPropagation();
    event.preventDefault();

    const dropdown = this.element.querySelector('.items-filter-dropdown');
    const filterBtn = event.currentTarget;

    // Toggle dropdown visibility
    const isVisible = dropdown.classList.contains('visible');

    if (isVisible) {
      dropdown.classList.remove('visible');
      filterBtn.classList.remove('active');
    } else {
      // Position dropdown
      const rect = filterBtn.getBoundingClientRect();
      dropdown.style.top = `${rect.bottom + 5}px`;
      dropdown.style.right = `${window.innerWidth - rect.right}px`;

      // Show dropdown
      dropdown.classList.add('visible');
      filterBtn.classList.add('active');

      // Sync checkbox states with current filter state
      this._syncCheckboxStates();
    }
  }

  /**
   * Handle sort option click
   * @param {string} sortType The sort type (alpha-asc, alpha-desc, aptitude-asc, aptitude-desc)
   * @private
   */
  _handleSortOption(sortType) {
    // Get the items tab content section specifically
    const itemsTab = this.element.querySelector('section[data-tab="items"]');
    if (!itemsTab) {
      return;
    }

    // Get all item lists within the items tab
    const itemLists = itemsTab.querySelectorAll('.item-list');

    itemLists.forEach((itemList) => {
      const items = Array.from(itemList.querySelectorAll('.item'));

      // Sort items based on sort type
      items.sort((a, b) => {
        // Get the item name from the .item-name div, excluding any child elements
        const aNameElement = a.querySelector('.item-name');
        const bNameElement = b.querySelector('.item-name');

        // Get text content excluding child elements (badges, indicators, etc.)
        const aName = this._getItemNameText(aNameElement)?.toLowerCase() || '';
        const bName = this._getItemNameText(bNameElement)?.toLowerCase() || '';

        if (sortType === 'alpha-asc') {
          return aName.localeCompare(bName);
        } else if (sortType === 'alpha-desc') {
          return bName.localeCompare(aName);
        } else if (
          sortType === 'aptitude-asc' ||
          sortType === 'aptitude-desc'
        ) {
          // Apply aptitude sorting to all item types
          // Get aptitude values from the aptitude-value span
          const aAptitudeElement = a.querySelector('.aptitude-value');
          const bAptitudeElement = b.querySelector('.aptitude-value');

          const aAptitude = aAptitudeElement?.textContent || '';
          const bAptitude = bAptitudeElement?.textContent || '';

          // Parse aptitude values (e.g., "F-3" -> {govern: "F", value: 3})
          const aParsed = this._parseAptitudeValue(aAptitude);
          const bParsed = this._parseAptitudeValue(bAptitude);

          if (sortType === 'aptitude-asc') {
            // Sort by aptitude value ascending (0 to 4)
            return aParsed.value - bParsed.value;
          } else {
            // Sort by aptitude value descending (4 to 0)
            return bParsed.value - aParsed.value;
          }
        }

        return 0;
      });

      // Reorder items in the DOM
      items.forEach((item) => {
        itemList.appendChild(item);
      });
    });

    // Store sort preference
    this.actor
      .update({
        'flags.dasu.itemSortState': sortType,
      })
      .catch((error) => {
        console.error('Error saving sort state:', error);
      });

    // Update sort button state to reflect current sort
    this._updateSortButtonState(sortType);
  }

  /**
   * Update the sort button state to reflect current sort type
   * @param {string|null} sortType The current sort type or null for no sort
   * @private
   */
  _updateSortButtonState(sortType) {
    const sortBtn = this.element.querySelector('.items-sort-btn');
    if (!sortBtn) return;

    const icon = sortBtn.querySelector('i');
    if (!icon) return;

    // Reset to default sort icon
    icon.className = 'fas fa-sort';

    // Update icon based on sort type
    if (sortType) {
      switch (sortType) {
        case 'alpha-asc':
          icon.className = 'fas fa-sort-alpha-down';
          break;
        case 'alpha-desc':
          icon.className = 'fas fa-sort-alpha-up';
          break;
        case 'aptitude-asc':
          icon.className = 'fas fa-sort-numeric-down';
          break;
        case 'aptitude-desc':
          icon.className = 'fas fa-sort-numeric-up';
          break;
        default:
          icon.className = 'fas fa-sort';
      }
    }
  }

  /**
   * Clear the current sort state and return to manual ordering
   * @private
   */
  _clearSortState() {
    this.actor
      .update({
        'flags.dasu.itemSortState': null,
      })
      .then(() => {
        this._updateSortButtonState(null);
        ui.notifications.info('Sort cleared - items now in manual order');
      })
      .catch((error) => {
        console.error('Error clearing sort state:', error);
      });
  }

  /**
   * Parse aptitude value string (e.g., "F-3" -> {govern: "F", value: 3})
   * @param {string} aptitudeValue The aptitude value string
   * @returns {Object} Parsed aptitude object with govern and value
   * @private
   */
  _parseAptitudeValue(aptitudeValue) {
    if (!aptitudeValue || aptitudeValue === 'N/A') {
      return { govern: '', value: -1 }; // Items without aptitude values sort at the bottom
    }

    const match = aptitudeValue.match(/^([A-Z]+)-(\d+)$/);
    if (match) {
      return {
        govern: match[1],
        value: parseInt(match[2], 10),
      };
    }

    // Fallback for invalid format
    return { govern: aptitudeValue, value: -1 };
  }

  /**
   * Extract the item name text from an item name element, excluding child elements
   * @param {HTMLElement} nameElement The .item-name element
   * @returns {string} The clean item name text
   * @private
   */
  _getItemNameText(nameElement) {
    if (!nameElement) return '';

    // Get all text nodes directly from the element
    const textNodes = [];
    const walker = document.createTreeWalker(
      nameElement,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (text) {
        textNodes.push(text);
      }
    }

    // Join all text nodes and clean up
    return textNodes.join(' ').trim();
  }

  /**
   * Sync checkbox states with current filter state
   * @private
   */
  _syncCheckboxStates() {
    const dropdown = this.element.querySelector('.items-filter-dropdown');
    const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
    const selectAllBtn = dropdown.querySelector('.select-all-btn');

    if (this._typeFilterState === null) {
      // No filter applied, all checkboxes should be checked
      checkboxes.forEach((cb) => (cb.checked = true));
      selectAllBtn.textContent = game.i18n.localize('DASU.Filter.SelectAll');
    } else {
      // Apply current filter state to checkboxes
      checkboxes.forEach((cb) => {
        cb.checked = this._typeFilterState.includes(cb.value);
      });

      // Update select all button text
      const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
      selectAllBtn.textContent = allChecked
        ? game.i18n.localize('DASU.Filter.SelectAll')
        : game.i18n.localize('DASU.Filter.DeselectAll');
    }
  }

  /**
   * Handle search input events
   * @param {Event} event The input event
   * @private
   */
  _handleSearchInput(event) {
    const searchTerm = event.target.value.toLowerCase().trim();
    const searchClear = this.element.querySelector('.search-clear');

    // Get the items tab specifically
    const itemsTab = this.element.querySelector('[data-tab="items"]');
    if (!itemsTab) {
      return;
    }

    const items = itemsTab.querySelectorAll('.item-list .item');

    // Show/hide clear button
    searchClear.style.display = searchTerm ? 'block' : 'none';

    // Filter items within the items tab only
    items.forEach((item) => {
      const itemName =
        item.querySelector('.item-name')?.textContent?.toLowerCase() || '';
      const isVisible = itemName.includes(searchTerm);

      item.style.display = isVisible ? '' : 'none';
    });
  }

  /**
   * Handle search clear button click
   * @param {Event} event The click event
   * @private
   */
  _handleSearchClear(event) {
    event.stopPropagation();

    const searchInput = this.element.querySelector('.items-search-input');
    const searchClear = this.element.querySelector('.search-clear');

    // Get the items tab specifically
    const itemsTab = this.element.querySelector('[data-tab="items"]');
    if (!itemsTab) {
      return;
    }

    const items = itemsTab.querySelectorAll('.item-list .item');

    // Clear search input
    searchInput.value = '';

    // Hide clear button
    searchClear.style.display = 'none';

    // Show all items within the items tab only
    items.forEach((item) => {
      item.style.display = '';
    });
  }

  /**
   * Handle document click events to close dropdown when clicking outside
   * @param {Event} event The click event
   * @private
   */
  _handleDocumentClick(event) {
    // Check if element exists (sheet might be closing)
    if (!this.element) {
      return;
    }

    // Only handle if we have a dropdown
    const dropdown = this.element.querySelector('.items-filter-dropdown');
    if (!dropdown || !dropdown.classList.contains('visible')) {
      return;
    }

    // Don't close if we just cleared the filter
    if (this._preventDropdownClose) {
      return;
    }

    // Check if click is outside the dropdown and filter button
    const filterBtn = this.element.querySelector('.items-filter-btn');
    const clickedElement = event.target;

    if (
      !dropdown.contains(clickedElement) &&
      !filterBtn.contains(clickedElement)
    ) {
      dropdown.classList.remove('visible');
      filterBtn.classList.remove('active');
    }
  }

  /**
   * Apply type filter
   * @param {HTMLElement} dropdown The filter dropdown
   * @private
   */
  _applyTypeFilter(dropdown) {
    const selectedTypes = Array.from(
      dropdown.querySelectorAll('input[type="checkbox"]:checked')
    ).map((cb) => cb.value);

    // Store filter state
    this._typeFilterState = selectedTypes;

    // Save filter state to actor data for persistence
    this.actor
      .update({
        'flags.dasu.itemFilterState': selectedTypes,
      })
      .catch((error) => {
        console.error('Error saving filter state:', error);
      });

    // Apply filter to items immediately
    this._filterItemsByType(selectedTypes);

    // Hide dropdown and reset positioning
    dropdown.classList.remove('visible');
    dropdown.style.top = '';
    dropdown.style.right = '';
    this.element.querySelector('.items-filter-btn').classList.remove('active');
  }

  /**
   * Clear the type filter
   * @param {HTMLElement} dropdown The filter dropdown
   * @private
   */
  _clearTypeFilter(dropdown) {
    // Set a flag to prevent document click handler from closing dropdown
    this._preventDropdownClose = true;

    // Reset all checkboxes
    dropdown
      .querySelectorAll('input[type="checkbox"]')
      .forEach((cb) => (cb.checked = true));
    dropdown.querySelector('.select-all-btn').textContent = game.i18n.localize(
      'DASU.Filter.SelectAll'
    );

    // Clear filter state
    this._typeFilterState = null;

    // Clear persisted filter state from actor data
    this.actor
      .update({
        'flags.dasu.itemFilterState': null,
      })
      .catch((error) => {
        console.error('Error clearing filter state:', error);
      });

    // Reset items display
    this._resetItemsDisplay();

    // Keep dropdown open
    dropdown.classList.add('visible');
    this.element.querySelector('.items-filter-btn').classList.add('active');

    // Clear the flag after a delay
    setTimeout(() => {
      this._preventDropdownClose = false;
    }, 100);
  }

  /**
   * Filter items by type
   * @param {string[]} selectedTypes Array of selected item types
   * @private
   */
  _filterItemsByType(selectedTypes) {
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      // Get the items tab specifically
      const itemsTab = this.element.querySelector('section[data-tab="items"]');
      if (!itemsTab) {
        return;
      }

      // Get all item lists within the items tab only
      const itemLists = itemsTab.querySelectorAll('.item-list');

      if (itemLists.length === 0) {
        return;
      }

      itemLists.forEach((itemList) => {
        const itemType = itemList.classList[1]?.replace('-list', '');

        if (selectedTypes.includes(itemType)) {
          // Show this type
          itemList.classList.remove('filtered-out');
          itemList.style.setProperty('display', '', 'important');
        } else {
          // Hide this type
          itemList.classList.add('filtered-out');
          itemList.style.setProperty('display', 'none', 'important');
        }
      });

      // Show/hide headers based on visible item lists (within items tab only)
      const headers = itemsTab.querySelectorAll('.items-header');

      headers.forEach((header) => {
        const itemType = header.dataset.itemType;
        const itemList = header.nextElementSibling;

        if (itemList && itemList.classList.contains('item-list')) {
          if (selectedTypes.includes(itemType)) {
            header.classList.remove('filtered-out');
            header.style.setProperty('display', '', 'important');
          } else {
            header.classList.add('filtered-out');
            header.style.setProperty('display', 'none', 'important');
          }
        }
      });

      // Reapply sort state after filtering
      const persistedSortState = this.actor.getFlag('dasu', 'itemSortState');
      if (persistedSortState && typeof persistedSortState === 'string') {
        setTimeout(() => {
          this._handleSortOption(persistedSortState);
        }, 10);
      }

      // Update sort button state on render
      this._updateSortButtonState(persistedSortState);
    });
  }

  /**
   * Reset items display to original state
   * @private
   */
  _resetItemsDisplay() {
    // Get the items tab specifically
    const itemsTab = this.element.querySelector('section[data-tab="items"]');
    if (!itemsTab) {
      return;
    }

    // Show all item lists within the items tab only
    itemsTab.querySelectorAll('.item-list').forEach((itemList) => {
      itemList.classList.remove('filtered-out');
      itemList.style.setProperty('display', '', 'important');
    });

    // Show all headers within the items tab only
    itemsTab.querySelectorAll('.items-header').forEach((header) => {
      header.classList.remove('filtered-out');
      header.style.setProperty('display', '', 'important');
    });
  }

  /**************
   *
   *   ACTIONS
   *
   **************/

  /**
   * Handle changing a Document's image.
   *
   * @this DASUActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @returns {Promise}
   * @protected
   */
  static async _onEditImage(event, target) {
    const attr = target.dataset.edit;
    const current = foundry.utils.getProperty(this.document, attr);
    const { img } =
      this.document.constructor.getDefaultArtwork?.(this.document.toObject()) ??
      {};
    const fp = new FilePicker({
      current,
      type: 'image',
      redirectToRoot: img ? [img] : [],
      callback: (path) => {
        this.document.update({ [attr]: path });
      },
      top: this.position.top + 40,
      left: this.position.left + 10,
    });
    return fp.browse();
  }

  /**
   * Renders an embedded document's sheet
   *
   * @this DASUActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _viewDoc(event, target) {
    const doc = this._getEmbeddedDocument(target);
    doc.sheet.render(true);
  }

  /**
   * Handles item deletion
   *
   * @this DASUActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _deleteDoc(event, target) {
    const doc = this._getEmbeddedDocument(target);
    await doc.delete();
  }

  /**
   * Create a new embedded Document within this parent Document
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _createDoc(event, target) {
    // Retrieve the configured document class for Item or ActiveEffect
    const docCls = getDocumentClass(target.dataset.documentClass);

    // Prepare the document creation data by initializing it a default name.
    // As of v12, you can define custom Active Effect subtypes just like Item subtypes if you want
    const docData = {
      name: docCls.defaultName({
        // defaultName handles an undefined type gracefully
        type: target.dataset.type,
        parent: this.actor,
      }),
    };

    // Loop through the dataset and add it to our docData
    for (const [dataKey, value] of Object.entries(target.dataset)) {
      // These data attributes are reserved for the action handling
      if (['action', 'documentClass'].includes(dataKey)) continue;

      // Handle special case for data-system-category
      if (dataKey === 'systemCategory') {
        docData.system = docData.system || {};
        docData.system.category = value;
        continue;
      }

      // Nested properties require dot notation in the HTML, e.g. anything with `system`
      // An example exists in spells.hbs, with `data-system.spell-level`
      // which turns into the dataKey 'system.spellLevel'
      foundry.utils.setProperty(docData, dataKey, value);
    }

    // Set category for ability items since they require subcategorization
    if (target.dataset.type === 'ability') {
      docData.system = docData.system || {};
      // If a category was specified in the data attributes, use it
      if (!docData.system.category) {
        // Otherwise use the first category from config
        const abilityCategories = globalThis.DASU?.ABILITY_CATEGORIES || [
          'spell',
          'affliction',
          'restorative',
          'technique',
        ];
        docData.system.category = abilityCategories[0];
      }

      // Initialize aptitudes for ability items
      if (!docData.system.aptitudes) {
        docData.system.aptitudes = {
          type: 'f',
          value: 0,
        };
      }
    }

    // Set default values for tactics to fix validation errors
    if (target.dataset.type === 'tactic') {
      docData.system = docData.system || {};
      docData.system.govern = docData.system.govern || 'pow';
      docData.system.damage = docData.system.damage || {};
      docData.system.damage.value = docData.system.damage.value || 0;
      docData.system.damage.type = docData.system.damage.type || 'physical';
      docData.system.toLand = docData.system.toLand || 0;
      docData.system.cost = docData.system.cost || 0;
      docData.system.effect = docData.system.effect || '';
    }

    // Set default values for specials
    if (target.dataset.type === 'special') {
      docData.system = docData.system || {};
      docData.system.specialType = docData.system.specialType || 'ability';
      docData.system.cost = docData.system.cost || 0;
      docData.system.duration = docData.system.duration || 0;
      docData.system.requirements = docData.system.requirements || '';
      docData.system.effect = docData.system.effect || '';
    }

    // Finally, create the embedded document!
    const createdDoc = await docCls.create(docData, { parent: this.actor });
    return createdDoc;
  }

  /**
   * Copy an existing document to create a duplicate
   *
   * @this DASUActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _copyDoc(event, target) {
    const item = this._getEmbeddedDocument(target);
    if (!item) return;

    // Create a copy of the item data
    const itemData = item.toObject();

    // Remove the _id to create a new item
    delete itemData._id;

    // Update the name to indicate it's a copy
    itemData.name = `${itemData.name} (Copy)`;

    // Remove any flags that shouldn't be copied (like leveling flags)
    if (itemData.flags?.dasu) {
      delete itemData.flags.dasu.grantedByLeveling;
      delete itemData.flags.dasu.levelingSource;
    }

    // Remove category field for non-ability items (like tactics)
    if (itemData.type !== 'ability' && itemData.system?.category) {
      delete itemData.system.category;
    }

    // Create the new item
    const newItem = await Item.create(itemData, { parent: this.actor });

    // Show a notification
    ui.notifications.info(`Copied ${item.name} to ${newItem.name}`);

    return newItem;
  }

  /**
   * Toggle the summoned status of a daemon in stocks
   *
   * @this DASUActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _toggleSummoned(event, target) {
    const daemonId = target.closest('li[data-actor-id]').dataset.actorId;
    const stocks = this.actor.system.stocks || [];
    const stockIndex = stocks.findIndex(
      (stock) => stock.references?.actor === daemonId
    );

    if (stockIndex === -1) return;

    const currentStock = stocks[stockIndex];
    const newIsSummoned = !currentStock.references.isSummoned;

    const updatedStocks = [...stocks];
    updatedStocks[stockIndex] = {
      ...currentStock,
      references: {
        ...currentStock.references,
        isSummoned: newIsSummoned,
      },
    };

    await this.actor.update({ 'system.stocks': updatedStocks });
  }

  /**
   * Remove a daemon from the summoner's stocks
   *
   * @this DASUActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _removeFromStock(event, target) {
    const daemonId = target.closest('li[data-actor-id]').dataset.actorId;
    const stocks = this.actor.system.stocks || [];
    const updatedStocks = stocks.filter(
      (stock) => stock.references?.actor !== daemonId
    );

    await this.actor.update({ 'system.stocks': updatedStocks });
  }

  /**
   * Determines effect parent to pass to helper
   *
   * @this DASUActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _toggleEffect(event, target) {
    const effect = this._getEmbeddedDocument(target);
    await effect.update({ disabled: !effect.disabled });
  }

  /**
   * Handle clickable rolls.
   *
   * @this DASUActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _onRoll(event, target) {
    event.preventDefault();
    const dataset = target.dataset;

    // Check if this is a skill tick roll for a summoner in combat
    // TODO: Replace with a fleshed out initiative mechanic later
    if (dataset.roll && this.document.type === 'summoner') {
      const combat = game.combat;
      if (combat) {
        const combatant = combat.combatants.find(
          (c) => c.actor.id === this.actor.id
        );
        // Only treat as initiative if actor is in combat and hasn't rolled initiative yet
        if (combatant && combatant.initiative === null) {
          // Extract skill ticks from the roll formula
          const rollMatch = dataset.roll.match(/(\d+)d6/);
          if (rollMatch) {
            const skillTicks = parseInt(rollMatch[1]);
            const skillName =
              target
                .closest('.skill')
                ?.querySelector('.skill-name')
                ?.textContent?.split(' (')[0] || 'Skill';

            // Use skill ticks for initiative instead of normal roll
            await Hooks.callAll(
              'dasu.rollInitiativeWithSkill',
              this.actor,
              skillName,
              skillTicks
            );
            return;
          }
        }
      }
    }

    // Handle item rolls.
    switch (dataset.rollType) {
      case 'item':
        const item = this._getEmbeddedDocument(target);
        if (item) return item.roll();
    }

    // Handle rolls that supply the formula directly.
    if (dataset.roll) {
      let label = dataset.label ? `${dataset.label}` : '';
      let roll = new Roll(dataset.roll, this.actor.getRollData());

      // For DASU success-based rolls
      if (label.includes('Check')) {
        // This is a DASU success-based roll
        await roll.evaluate();
        let successes = 0;
        let rollResults = [];

        // Count successes (4-6) from the roll results and collect all results
        if (roll.dice && roll.dice.length > 0) {
          for (const die of roll.dice) {
            if (die.results) {
              for (const result of die.results) {
                rollResults.push(result.result);
                if (result.result >= 4 && result.result <= 6) {
                  successes++;
                }
              }
            }
          }
        }

        // Play roll sound
        foundry.audio.AudioHelper.play({ src: CONFIG.sounds.dice });

        // Create a more detailed message with roll results
        const successText = successes === 1 ? 'success' : 'successes';
        const flavor = `${label}<br><strong>Roll: [${rollResults.join(
          ', '
        )}]</strong><br><strong>Result: ${successes} ${successText}</strong>`;

        const messageData = {
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          flavor: flavor,
          roll: roll,
          rollMode: game.settings.get('core', 'rollMode'),
        };

        await ChatMessage.create(messageData);
        return roll;
      } else {
        // Regular roll
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          flavor: label,
          rollMode: game.settings.get('core', 'rollMode'),
        });
        return roll;
      }
    }
  }

  /** Helper Functions */

  /**
   * Fetches the embedded document representing the containing HTML element
   *
   * @param {HTMLElement} target    The element subject to search
   * @returns {Item | ActiveEffect | Actor} The embedded Item, ActiveEffect, or Actor
   */
  _getEmbeddedDocument(target) {
    const docRow = target.closest('li[data-document-class]');
    if (docRow.dataset.documentClass === 'Item') {
      return this.actor.items.get(docRow.dataset.itemId);
    } else if (docRow.dataset.documentClass === 'ActiveEffect') {
      const parent =
        docRow.dataset.parentId === this.actor.id
          ? this.actor
          : this.actor.items.get(docRow?.dataset.parentId);
      return parent.effects.get(docRow?.dataset.effectId);
    } else if (docRow.dataset.documentClass === 'Actor') {
      return game.actors.get(docRow.dataset.actorId);
    } else return console.warn('Could not find document class');
  }

  /***************
   *
   * Drag and Drop
   *
   ***************/

  /**
   * Handle the dropping of ActiveEffect data onto an Actor Sheet
   * @param {DragEvent} event                  The concluding DragEvent which contains drop data
   * @param {object} data                      The data transfer extracted from the event
   * @returns {Promise<ActiveEffect|boolean>}  The created ActiveEffect object or false if it couldn't be created.
   * @protected
   */
  async _onDropActiveEffect(event, data) {
    const aeCls = getDocumentClass('ActiveEffect');
    const effect = await aeCls.fromDropData(data);
    if (!this.actor.isOwner || !effect) return false;
    if (effect.target === this.actor)
      return this._onSortActiveEffect(event, effect);
    return aeCls.create(effect, { parent: this.actor });
  }

  /**
   * Handle a drop event for an existing embedded Active Effect to sort that Active Effect relative to its siblings
   *
   * @param {DragEvent} event
   * @param {ActiveEffect} effect
   */
  async _onSortActiveEffect(event, effect) {
    /** @type {HTMLElement} */
    const dropTarget = event.target.closest('[data-effect-id]');
    if (!dropTarget) return;
    const target = this._getEmbeddedDocument(dropTarget);

    // Don't sort on yourself
    if (effect.uuid === target.uuid) return;

    // Identify sibling items based on adjacent HTML elements
    const siblings = [];
    for (const el of dropTarget.parentElement.children) {
      const siblingId = el.dataset.effectId;
      const parentId = el.dataset.parentId;
      if (
        siblingId &&
        parentId &&
        (siblingId !== effect.id || parentId !== effect.parent.id)
      )
        siblings.push(this._getEmbeddedDocument(el));
    }

    // Perform the sort
    const sortUpdates = SortingHelpers.performIntegerSort(effect, {
      target,
      siblings,
    });

    // Split the updates up by parent document
    const directUpdates = [];

    const grandchildUpdateData = sortUpdates.reduce((items, u) => {
      const parentId = u.target.parent.id;
      const update = { _id: u.target.id, ...u.update };
      if (parentId === this.actor.id) {
        directUpdates.push(update);
        return items;
      }
      if (items[parentId]) items[parentId].push(update);
      else items[parentId] = [update];
      return items;
    }, {});

    // Effects-on-items updates
    for (const [itemId, updates] of Object.entries(grandchildUpdateData)) {
      await this.actor.items
        .get(itemId)
        .updateEmbeddedDocuments('ActiveEffect', updates);
    }

    // Update on the main actor
    return this.actor.updateEmbeddedDocuments('ActiveEffect', directUpdates);
  }

  /**
   * Handle dropping of an Actor data onto another Actor sheet
   * @param {DragEvent} event            The concluding DragEvent which contains drop data
   * @param {object} data                The data transfer extracted from the event
   * @returns {Promise<object|boolean>}  A data object which describes the result of the drop, or false if the drop was
   *                                     not permitted.
   * @protected
   */
  async _onDropActor(event, data) {
    if (!this.actor.isOwner) return false;

    // Only allow dropping daemons onto summoners
    if (this.actor.type !== 'summoner') return false;

    const actor = await Actor.implementation.fromDropData(data);
    if (!actor || actor.type !== 'daemon') return false;

    // Check if daemon is already in stocks
    const stocks = this.actor.system.stocks || [];
    const existingStock = stocks.find(
      (stock) => stock.references?.actor === actor.id
    );

    if (existingStock) {
      ui.notifications.warn('This daemon is already in your stocks');
      return false;
    }

    // Add daemon to stocks
    const newStock = {
      references: {
        actor: actor.id,
        isSummoned: false,
      },
    };

    const updatedStocks = [...stocks, newStock];
    await this.actor.update({ 'system.stocks': updatedStocks });

    ui.notifications.info(`Added ${actor.name} to your stocks`);

    // Refresh the sheet to show the new daemon
    this.render(true);

    return true;
  }

  /* -------------------------------------------- */

  /**
   * Handle dropping of a Folder on an Actor Sheet.
   * The core sheet currently supports dropping a Folder of Items to create all items as owned items.
   * @param {DragEvent} event     The concluding DragEvent which contains drop data
   * @param {object} data         The data transfer extracted from the event
   * @returns {Promise<Item[]>}
   * @protected
   */
  async _onDropFolder(event, data) {
    if (!this.actor.isOwner) return [];
    const folder = await Folder.implementation.fromDropData(data);
    if (folder.type !== 'Item') return [];
    const droppedItemData = await Promise.all(
      folder.contents.map(async (item) => {
        if (!(document instanceof Item)) item = await fromUuid(item.uuid);
        return item;
      })
    );
    return this._onDropItemCreate(droppedItemData, event);
  }

  /**
   * Handle the final creation of dropped Item data on the Actor.
   * This method is factored out to allow downstream classes the opportunity to override item creation behavior.
   * @param {object[]|object} itemData      The item data requested for creation
   * @param {DragEvent} event               The concluding DragEvent which provided the drop data
   * @returns {Promise<Item[]>}
   * @private
   */
  async _onDropItemCreate(itemData, event) {
    itemData = itemData instanceof Array ? itemData : [itemData];
    return this.actor.createEmbeddedDocuments('Item', itemData);
  }

  /********************
   *
   * Actor Override Handling
   *
   ********************/

  /**
   * Submit a document update based on the processed form data.
   * @param {SubmitEvent} event                   The originating form submission event
   * @param {HTMLFormElement} form                The form element that was submitted
   * @param {object} submitData                   Processed and validated form data to be used for a document update
   * @returns {Promise<void>}
   * @protected
   * @override
   */
  async _processSubmitData(event, form, submitData) {
    const overrides = foundry.utils.flattenObject(this.actor.overrides);
    for (let k of Object.keys(overrides)) delete submitData[k];
    await this.document.update(submitData);
  }

  /**
   * Handle manual form submission for fields that need it
   * @param {Event} event The input event
   * @private
   */
  async _handleManualSubmit(event) {
    // Prevent default form submission
    event.preventDefault && event.preventDefault();

    // Get form data
    const form = event.target.form || event.target.closest('form');
    const formData = new FormData(form);
    const submitData = {};

    for (const [key, value] of formData.entries()) {
      // Skip radio buttons as they're handled separately
      if (key.includes('skill-tick-radio')) continue;

      // Convert value based on data type
      const input = form.querySelector(`[name="${key}"]`);
      const fieldType = input?.dataset.dtype || 'String';

      let processedValue = value;
      if (fieldType === 'Number') {
        processedValue = parseFloat(value) || 0;
      } else if (fieldType === 'Boolean') {
        processedValue = value === 'true';
      }

      submitData[key] = processedValue;
    }

    // Always include the current skills array to prevent reset
    submitData['system.skills'] = this.actor.system.skills;

    // Update the actor
    try {
      await this.actor.update(submitData);
    } catch (error) {
      console.error('Error updating form data:', error);
    }
  }

  /**
   * Disables inputs subject to active effects
   */
  #disableOverrides() {
    const flatOverrides = foundry.utils.flattenObject(this.actor.overrides);
    for (const override of Object.keys(flatOverrides)) {
      const input = this.element.querySelector(`[name="${override}"]`);
      if (input) {
        input.disabled = true;
      }
    }
  }

  /**
   * Handle increasing an attribute's tick level
   * @this DASUActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _increaseAttribute(event, target) {
    if (!['daemon', 'summoner'].includes(this.document.type)) return;

    const attribute = target.dataset.attribute;
    if (!attribute || !['pow', 'dex', 'will', 'sta'].includes(attribute))
      return;

    const currentTick = this.document.system.attributes[attribute]?.tick ?? 1;
    const targetTick = Math.min(6, currentTick + 1);
    // Only call if we're actually increasing
    if (targetTick > currentTick) {
      await this.document.setAttributeTick(attribute, targetTick);
    }
  }

  /**
   * Handle decreasing an attribute's tick level
   * @this DASUActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _decreaseAttribute(event, target) {
    if (!['daemon', 'summoner'].includes(this.document.type)) return;

    const attribute = target.dataset.attribute;
    if (!attribute || !['pow', 'dex', 'will', 'sta'].includes(attribute))
      return;

    const currentTick = this.document.system.attributes[attribute]?.tick ?? 1;
    const targetTick = Math.max(1, currentTick - 1);
    // Only call if we're actually decreasing
    if (targetTick < currentTick) {
      await this.document.setAttributeTick(attribute, targetTick);
    }
  }

  /** @override */
  async close(options = {}) {
    // Remove document click listener
    // document.removeEventListener('click', this._handleDocumentClick.bind(this));

    // Clean up mutation observer
    if (this._mutationObserver) {
      this._mutationObserver.disconnect();
      this._mutationObserver = null;
    }

    // Reset filter state loaded flag so it loads again on next open
    this._filterStateLoaded = false;

    return super.close(options);
  }

  /**
   * Handle select all button click
   * @param {Event} event The click event
   * @private
   */
  _handleSelectAll(event) {
    event.stopPropagation();
    event.preventDefault();

    const dropdown = this.element.querySelector('.items-filter-dropdown');
    const selectAllBtn = dropdown.querySelector('.select-all-btn');
    const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
    const allChecked = Array.from(checkboxes).every((cb) => cb.checked);

    checkboxes.forEach((cb) => {
      cb.checked = !allChecked;
    });

    selectAllBtn.textContent = allChecked
      ? game.i18n.localize('DASU.Filter.SelectAll')
      : game.i18n.localize('DASU.Filter.DeselectAll');
  }

  /**
   * Handle apply filter button click
   * @param {Event} event The click event
   * @private
   */
  _handleApplyFilter(event) {
    event.stopPropagation();

    const dropdown = this.element.querySelector('.items-filter-dropdown');
    this._applyTypeFilter(dropdown);
  }

  /**
   * Handle clear filter button click
   * @param {Event} event The click event
   * @private
   */
  _handleClearFilter(event) {
    event.stopPropagation();

    const dropdown = this.element.querySelector('.items-filter-dropdown');
    this._clearTypeFilter(dropdown);
  }

  /**
   * Load persisted filter state from actor data
   * @private
   */
  _loadPersistedFilterState() {
    const persistedState = this.actor.getFlag('dasu', 'itemFilterState');

    if (
      persistedState !== null &&
      persistedState !== undefined &&
      Array.isArray(persistedState)
    ) {
      this._typeFilterState = persistedState;

      // Apply filter after a short delay to ensure DOM is ready
      setTimeout(() => {
        this._filterItemsByType(persistedState);
      }, 50);
    }
  }

  /**
   * Load persisted sort state from actor data
   * @private
   */
  _loadPersistedSortState() {
    const persistedSortState = this.actor.getFlag('dasu', 'itemSortState');

    if (persistedSortState && typeof persistedSortState === 'string') {
      // Apply sort after a short delay to ensure DOM is ready
      setTimeout(() => {
        this._handleSortOption(persistedSortState);
      }, 50);
    }
  }

  /** @override */
  async _render(force = false, options = {}) {
    const result = await super._render(force, options);

    // Check for persisted filter state if we don't have a current state
    if (this._typeFilterState === null || this._typeFilterState === undefined) {
      this._loadPersistedFilterState();
    }

    // Reapply filter state after render if it exists
    if (this._typeFilterState !== null && this._typeFilterState !== undefined) {
      setTimeout(() => {
        this._filterItemsByType(this._typeFilterState);
      }, 50);
    }

    // Load persisted sort state
    this._loadPersistedSortState();

    return result;
  }

  /**
   * Set up mutation observer to watch for DOM changes
   * @private
   */
  _setupMutationObserver() {
    if (this._mutationObserver) {
      this._mutationObserver.disconnect();
      this._mutationObserver = null;
    }

    this._mutationObserver = new MutationObserver(() => {
      if (this._typeFilterState) {
        setTimeout(() => {
          this._filterItemsByType(this._typeFilterState);
        }, 10);
      }
    });

    const itemsList = this.element.querySelector('.items-list');
    if (itemsList) {
      this._mutationObserver.observe(itemsList, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class'],
      });
    }
  }

  /**
   * Initialize filter state from persisted data
   * @private
   */
  _initializeFilterState() {
    const persistedState = this.actor.getFlag('dasu', 'itemFilterState');

    if (
      persistedState !== null &&
      persistedState !== undefined &&
      Array.isArray(persistedState)
    ) {
      this._typeFilterState = persistedState;

      setTimeout(() => {
        this._filterItemsByType(persistedState);
      }, 50);
    }
  }

  /**
   * Set up event listeners for the items list
   * @private
   */
  _setupItemsEventListeners() {
    // Store bound function references to ensure proper removal
    this._boundHandleSelectAll = this._handleSelectAll.bind(this);
    this._boundHandleApplyFilter = this._handleApplyFilter.bind(this);
    this._boundHandleClearFilter = this._handleClearFilter.bind(this);
    this._boundHandleSearchInput = this._handleSearchInput.bind(this);
    this._boundHandleSearchClear = this._handleSearchClear.bind(this);
    this._boundHandleItemHeaderClick = this._handleItemHeaderClick.bind(this);
    // this._boundHandleFilterBtnClick = this._handleFilterBtnClick.bind(this); // Removed - using inline handler
    this._boundHandleDocumentClick = this._handleDocumentClick.bind(this);
    this._boundHandleDragStart = this._handleDragStart.bind(this);
    this._boundHandleSortStart = this._handleSortStart.bind(this);
    this._boundHandleSortOver = this._handleSortOver.bind(this);
    this._boundHandleSortLeave = this._handleSortLeave.bind(this);
    this._boundHandleSortDrop = this._handleSortDrop.bind(this);

    // Search input
    const searchInput = this.element.querySelector('.items-search-input');
    if (searchInput) {
      searchInput.removeEventListener('input', this._boundHandleSearchInput);
      searchInput.addEventListener('input', this._boundHandleSearchInput);
    }

    // Search clear button
    const searchClear = this.element.querySelector('.search-clear');
    if (searchClear) {
      searchClear.removeEventListener('click', this._boundHandleSearchClear);
      searchClear.addEventListener('click', this._boundHandleSearchClear);
    }

    // Item headers for collapse/expand
    const itemHeaders = this.element.querySelectorAll('.items-header');
    itemHeaders.forEach((header) => {
      header.removeEventListener('click', this._boundHandleItemHeaderClick);
      header.addEventListener('click', this._boundHandleItemHeaderClick);
    });

    // // Filter button
    // const filterBtn = this.element.querySelector('.items-filter-btn');
    // if (filterBtn) {
    //   filterBtn.removeEventListener('click', this._boundHandleFilterBtnClick);
    //   filterBtn.addEventListener('click', this._boundHandleFilterBtnClick);
    // }

    // Document click listener for closing dropdown
    document.removeEventListener('click', this._boundHandleDocumentClick);
    document.addEventListener('click', this._boundHandleDocumentClick);

    // Drag event listeners for tag items (handle these first to avoid conflicts)
    const tagItems = this.element.querySelectorAll('[data-drag-type="tag"]');
    tagItems.forEach((item) => {
      item.removeEventListener('dragstart', this._boundHandleDragStart);
      item.addEventListener('dragstart', this._boundHandleDragStart);
    });

    // Sortable items event listeners (exclude tag items to avoid conflicts)
    const sortableItems = this.element.querySelectorAll(
      '[data-sortable="true"]:not([data-drag-type="tag"])'
    );
    sortableItems.forEach((item) => {
      item.removeEventListener('dragstart', this._boundHandleSortStart);
      item.removeEventListener('dragover', this._boundHandleSortOver);
      item.removeEventListener('dragleave', this._boundHandleSortLeave);
      item.removeEventListener('drop', this._boundHandleSortDrop);

      item.addEventListener('dragstart', (event) => {
        this._isDragging = true;
        if (this._boundHandleSortStart) this._boundHandleSortStart(event);
      });
      item.addEventListener('dragend', (event) => {
        this._isDragging = false;
        // Clean up drag-over/dragging classes
        item.classList.remove(
          'drag-over',
          'dragging',
          'drop-before',
          'drop-after',
          'drop-into'
        );
      });
      item.addEventListener('dragover', this._boundHandleSortOver);
      item.addEventListener('dragleave', (event) => {
        if (this._boundHandleSortLeave) this._boundHandleSortLeave(event);
        // Clean up drag-over class
        item.classList.remove(
          'drag-over',
          'drop-before',
          'drop-after',
          'drop-into'
        );
      });
      item.addEventListener('drop', (event) => {
        this._isDragging = false;
        if (this._boundHandleSortDrop) this._boundHandleSortDrop(event);
        // Clean up drag-over/dragging classes
        item.classList.remove(
          'drag-over',
          'dragging',
          'drop-before',
          'drop-after',
          'drop-into'
        );
      });
    });

    // Filter dropdown
    const dropdown = this.element.querySelector('.items-filter-dropdown');
    if (dropdown) {
      // Prevent dropdown clicks from closing it
      dropdown.addEventListener('click', (event) => {
        event.stopPropagation();

        // Handle button clicks with event delegation
        const currentBtn = event.currentTarget;

        if (currentBtn.classList.contains('select-all-btn')) {
          this._handleSelectAll(event);
        } else if (currentBtn.classList.contains('apply-filter-btn')) {
          this._handleApplyFilter(event);
        } else if (currentBtn.classList.contains('clear-filter-btn')) {
          this._handleClearFilter(event);
        }
      });

      // Also add individual listeners as backup
      const selectAllBtn = dropdown.querySelector('.select-all-btn');
      if (selectAllBtn) {
        selectAllBtn.removeEventListener('click', this._boundHandleSelectAll);
        selectAllBtn.addEventListener('click', this._boundHandleSelectAll);
      }

      const applyBtn = dropdown.querySelector('.apply-filter-btn');
      if (applyBtn) {
        applyBtn.removeEventListener('click', this._boundHandleApplyFilter);
        applyBtn.addEventListener('click', this._boundHandleApplyFilter);
      }

      const clearBtn = dropdown.querySelector('.clear-filter-btn');
      if (clearBtn) {
        clearBtn.removeEventListener('click', this._boundHandleClearFilter);
        clearBtn.addEventListener('click', this._boundHandleClearFilter);
      }
    }

    // Set up mutation observer to watch for DOM changes
    if (!this._mutationObserver) {
      this._setupMutationObserver();
    }

    // At the top of _setupItemsEventListeners:
    const sortBtn = this.element.querySelector('.items-sort-btn');
    const sortDropdown = this.element.querySelector('.items-sort-dropdown');
    const filterBtn = this.element.querySelector('.items-filter-btn');
    const filterDropdown = this.element.querySelector('.items-filter-dropdown');

    // Sort button logic
    if (sortBtn) {
      sortBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        event.preventDefault();
        // Close filter dropdown if open
        if (filterDropdown && filterDropdown.classList.contains('visible')) {
          filterDropdown.classList.remove('visible');
          filterBtn.classList.remove('active');
        }
        // Toggle sort dropdown
        const isVisible = sortDropdown.classList.contains('visible');
        if (isVisible) {
          sortDropdown.classList.remove('visible');
          sortBtn.classList.remove('active');
        } else {
          // Position dropdown
          const rect = sortBtn.getBoundingClientRect();
          sortDropdown.style.top = `${rect.bottom + 5}px`;
          sortDropdown.style.right = `${window.innerWidth - rect.right}px`;
          sortDropdown.classList.add('visible');
          sortBtn.classList.add('active');
        }
      });
    }

    // Sort option clicks
    if (sortDropdown) {
      sortDropdown.addEventListener('click', (event) => {
        const sortOption = event.target.closest('.sort-option');
        if (sortOption) {
          const sortType = sortOption.dataset.sort;
          if (sortType) {
            if (sortType === 'clear') {
              this._clearSortState();
            } else {
              this._handleSortOption(sortType);
            }
            // Close dropdown
            sortDropdown.classList.remove('visible');
            sortBtn.classList.remove('active');
          }
        }
      });
    }
    // Filter button logic
    if (filterBtn) {
      filterBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        event.preventDefault();
        // Close sort dropdown if open
        if (sortDropdown && sortDropdown.classList.contains('visible')) {
          sortDropdown.classList.remove('visible');
          sortBtn.classList.remove('active');
        }
        // Toggle filter dropdown
        const isVisible = filterDropdown.classList.contains('visible');
        if (isVisible) {
          filterDropdown.classList.remove('visible');
          filterBtn.classList.remove('active');
        } else {
          // Position dropdown
          const rect = filterBtn.getBoundingClientRect();
          filterDropdown.style.top = `${rect.bottom + 5}px`;
          filterDropdown.style.right = `${window.innerWidth - rect.right}px`;
          filterDropdown.classList.add('visible');
          filterBtn.classList.add('active');

          // Sync checkbox states with current filter state
          this._syncCheckboxStates();
        }
      });
    }

    // Sort option event listeners
    const sortOptions = this.element.querySelectorAll('.sort-option');
    sortOptions.forEach((option) => {
      option.addEventListener('click', (event) => {
        event.stopPropagation();
        const sortType = option.dataset.sort;
        this._handleSortOption(sortType);

        // Close dropdown
        const sortDropdown = this.element.querySelector('.items-sort-dropdown');
        const sortBtn = this.element.querySelector('.items-sort-btn');
        if (sortDropdown) {
          sortDropdown.classList.remove('visible');
        }
        if (sortBtn) {
          sortBtn.classList.remove('active');
        }
      });
    });
  }

  /**
   * Handle drag start for tag items
   * @param {DragEvent} event The drag start event
   * @private
   */
  _handleDragStart(event) {
    const itemId = event.target.dataset.itemId;
    const dragType = event.target.dataset.dragType;

    if (dragType === 'tag') {
      const tag = this.actor.items.get(itemId);
      if (tag && tag.type === 'tag') {
        // Check if this tag is already equipped in any weapon
        const equippedWeapons = this.actor.items.filter(
          (item) => item.type === 'weapon'
        );
        const isAlreadyEquipped = equippedWeapons.some((weapon) => {
          const tagSlots = weapon.system.tagSlots || {};
          return Object.values(tagSlots).some((slot) => slot.tagId === itemId);
        });

        if (isAlreadyEquipped) {
          event.preventDefault();
          ui.notifications.warn('This tag is already equipped in a weapon');
          return;
        }

        // Set drag data
        event.dataTransfer.setData(
          'application/json',
          JSON.stringify({
            type: 'tag',
            itemId: itemId,
            actorId: this.actor.id,
          })
        );

        // Set drag image
        const dragImage = event.target.cloneNode(true);
        dragImage.style.opacity = '0.7';
        dragImage.style.position = 'absolute';
        dragImage.style.top = '-1000px';
        document.body.appendChild(dragImage);
        event.dataTransfer.setDragImage(dragImage, 12, 12);

        // Remove the temporary element after a short delay
        setTimeout(() => {
          document.body.removeChild(dragImage);
        }, 0);
      }
    }
  }

  /* =========================
     Drag and Drop - Visual Feedback
     ========================= */

  /**
   * Clear all drop indicators
   * @private
   */
  _clearDropIndicators() {
    this.element
      .querySelectorAll('.drop-before, .drop-after, .drop-into, .drag-over')
      .forEach((el) => {
        el.classList.remove(
          'drop-before',
          'drop-after',
          'drop-into',
          'drag-over'
        );
      });
  }

  /* =========================
     Drag and Drop - Event Handlers
     ========================= */

  /**
   * Handle sort start for items
   * @param {DragEvent} event The drag start event
   * @private
   */
  _handleSortStart(event) {
    const itemId = event.target.dataset.itemId;
    const item = this.actor.items.get(itemId);

    if (!item) return;

    // Add dragging class for visual feedback
    event.target.classList.add('dragging');

    // Store dragged item data for use during dragover
    this._draggedItemData = {
      id: itemId,
      type: item.type,
      actorId: this.actor.id,
    };

    // Set drag data for sorting
    const dragData = {
      type: 'sort',
      itemId: itemId,
      itemType: item.type,
      actorId: this.actor.id,
    };
    event.dataTransfer.setData('application/json', JSON.stringify(dragData));

    // Set drag image
    this._setDragImage(event);

    // Clean up when drag ends
    this._setupDragEndCleanup(event);
  }

  /**
   * Handle sort over for items
   * @param {DragEvent} event The drag over event
   * @private
   */
  _handleSortOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    const target = event.target.closest('[data-sortable="true"]');
    if (!target) return;

    this._clearDropIndicators();

    // Handle different drop targets
    if (target.classList.contains('items-header')) {
      this._handleHeaderDropOver(target);
    } else if (this._isTagToWeaponDrop(target)) {
      this._handleTagToWeaponDropOver(target);
    } else {
      this._handleItemToItemDropOver(target);
    }
  }

  /**
   * Handle sort leave for items
   * @param {DragEvent} event The drag leave event
   * @private
   */
  _handleSortLeave(event) {
    const relatedTarget = event.relatedTarget;
    if (!relatedTarget || !relatedTarget.closest('[data-sortable="true"]')) {
      this._clearDropIndicators();
    }
  }

  /**
   * Handle sort drop for items
   * @param {DragEvent} event The drop event
   * @private
   */
  async _handleSortDrop(event) {
    event.preventDefault();
    this._clearDropIndicators();

    const dragData = this._getDragData(event);
    if (!dragData) return;

    const target = event.target.closest('[data-sortable="true"]');
    if (!target) return;

    // Handle different drop targets
    if (target.classList.contains('items-header')) {
      await this._handleHeaderDrop(dragData, target);
    } else if (this._isTagToWeaponDrop(target)) {
      await this._handleTagToWeaponDrop(dragData, target);
    } else {
      await this._handleItemToItemDrop(dragData, target);
    }
  }

  /* =========================
     Drag and Drop - Helper Methods
     ========================= */

  /**
   * Set drag image for visual feedback
   * @param {DragEvent} event The drag event
   * @private
   */
  _setDragImage(event) {
    const dragImage = event.target.cloneNode(true);
    dragImage.style.opacity = '0.7';
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    dragImage.classList.add('drag-ghost');
    document.body.appendChild(dragImage);
    event.dataTransfer.setDragImage(dragImage, 12, 12);

    // Remove the temporary element after a short delay
    setTimeout(() => {
      document.body.removeChild(dragImage);
    }, 0);
  }

  /**
   * Setup cleanup when drag ends
   * @param {DragEvent} event The drag event
   * @private
   */
  _setupDragEndCleanup(event) {
    const removeDraggingClass = () => {
      event.target.classList.remove('dragging');
      this._draggedItemData = null;
      document.removeEventListener('dragend', removeDraggingClass);
    };
    document.addEventListener('dragend', removeDraggingClass);
  }

  /**
   * Get and validate drag data from event
   * @param {DragEvent} event The drop event
   * @returns {Object|null} The parsed drag data or null if invalid
   * @private
   */
  _getDragData(event) {
    let dragData;
    try {
      const dataText = event.dataTransfer.getData('application/json');
      if (!dataText || dataText.trim() === '') {
        console.warn('No drag data available');
        return null;
      }
      dragData = JSON.parse(dataText);
    } catch (error) {
      console.error('Error parsing drag data:', error);
      return null;
    }

    // Validate drag data
    if (!dragData || !dragData.type || !dragData.itemId || !dragData.actorId) {
      console.warn('Invalid drag data:', dragData);
      return null;
    }

    if (dragData.type !== 'sort' || dragData.actorId !== this.actor.id) {
      return null;
    }

    return dragData;
  }

  /**
   * Check if this is a tag being dropped on a weapon
   * @param {HTMLElement} target The drop target
   * @returns {boolean} True if tag to weapon drop
   * @private
   */
  _isTagToWeaponDrop(target) {
    if (
      !this._draggedItemData ||
      this._draggedItemData.actorId !== this.actor.id
    ) {
      return false;
    }

    const draggedItem = this.actor.items.get(this._draggedItemData.id);
    const targetItem = this.actor.items.get(target.dataset.itemId);

    return (
      draggedItem &&
      targetItem &&
      draggedItem.type === 'tag' &&
      targetItem.type === 'weapon'
    );
  }

  /**
   * Handle drag over on header
   * @param {HTMLElement} target The header element
   * @private
   */
  _handleHeaderDropOver(target) {
    target.classList.add('drag-over');
  }

  /**
   * Handle drag over for tag to weapon drop
   * @param {HTMLElement} target The weapon element
   * @private
   */
  _handleTagToWeaponDropOver(target) {
    target.classList.add('drop-into');
  }

  /**
   * Handle drag over for item to item drop
   * @param {HTMLElement} target The target item element
   * @private
   */
  _handleItemToItemDropOver(target) {
    target.classList.add('drop-after');
  }

  /**
   * Handle drop on header (move to top)
   * @param {Object} dragData The drag data
   * @param {HTMLElement} target The header element
   * @private
   */
  async _handleHeaderDrop(dragData, target) {
    const itemType = target.dataset.itemType;
    const itemCategory = target.dataset.systemCategory || null;
    const draggedItem = this.actor.items.get(dragData.itemId);

    if (!draggedItem) return;

    // Check if this is a valid drop for this header
    if (!this._isValidHeaderDrop(draggedItem, itemType, itemCategory)) {
      return;
    }

    // Check if item is already at the top
    if (this._isItemAlreadyAtTop(draggedItem, itemType, itemCategory)) {
      return;
    }

    await this._moveItemToTop(draggedItem, itemType, itemCategory);
  }

  /**
   * Handle tag drop on weapon (insert into slot)
   * @param {Object} dragData The drag data
   * @param {HTMLElement} target The weapon element
   * @private
   */
  async _handleTagToWeaponDrop(dragData, target) {
    const draggedItem = this.actor.items.get(dragData.itemId);
    const targetItem = this.actor.items.get(target.dataset.itemId);

    if (draggedItem && targetItem) {
      await this._insertTagIntoWeapon(draggedItem, targetItem);
    }
  }

  /**
   * Handle item drop on another item (reorder)
   * @param {Object} dragData The drag data
   * @param {HTMLElement} target The target item element
   * @private
   */
  async _handleItemToItemDrop(dragData, target) {
    const draggedItemId = dragData.itemId;
    const droppedOnItemId = target.dataset.itemId;

    if (draggedItemId === droppedOnItemId) return;

    const draggedItem = this.actor.items.get(draggedItemId);
    const targetItem = this.actor.items.get(droppedOnItemId);

    if (draggedItem && targetItem && draggedItem.type === targetItem.type) {
      await this._reorderItems(draggedItem, targetItem, target);
    }
  }

  /**
   * Check if this is a valid drop for the given header
   * @param {Item} draggedItem The dragged item
   * @param {string} itemType The header item type
   * @param {string|null} itemCategory The header item category
   * @returns {boolean} True if valid drop
   * @private
   */
  _isValidHeaderDrop(draggedItem, itemType, itemCategory) {
    if (itemCategory) {
      return (
        draggedItem.type === 'ability' &&
        draggedItem.system.category === itemCategory
      );
    } else {
      return draggedItem.type === itemType;
    }
  }

  /**
   * Check if item is already at the top of its list
   * @param {Item} draggedItem The dragged item
   * @param {string} itemType The item type
   * @param {string|null} itemCategory The item category
   * @returns {boolean} True if already at top
   * @private
   */
  _isItemAlreadyAtTop(draggedItem, itemType, itemCategory) {
    let itemsOfType;
    if (itemCategory) {
      itemsOfType = this.actor.items.filter(
        (i) => i.type === 'ability' && i.system.category === itemCategory
      );
    } else {
      itemsOfType = this.actor.items.filter((i) => i.type === itemType);
    }

    // Sort by current sort values to get the actual order
    itemsOfType.sort((a, b) => (a.sort || 0) - (b.sort || 0));

    // Don't prevent if there's only one item - allow it to refresh the order
    return itemsOfType.length > 1 && itemsOfType[0].id === draggedItem.id;
  }

  /* =========================
     Item Operations
     ========================= */

  /**
   * Insert a tag into an open weapon slot
   * @param {Item} tag The tag to insert
   * @param {Item} weapon The weapon to insert the tag into
   * @private
   */
  async _insertTagIntoWeapon(tag, weapon) {
    // Check if tag is already equipped
    const equippedWeapons = this.actor.items.filter(
      (item) => item.type === 'weapon'
    );
    const isAlreadyEquipped = equippedWeapons.some((w) => {
      const tagSlots = w.system.tagSlots || {};
      return Object.values(tagSlots).some((slot) => slot.tagId === tag.id);
    });

    if (isAlreadyEquipped) {
      ui.notifications.warn('This tag is already equipped in a weapon');
      return;
    }

    // Get current tag slots or initialize with 2 slots
    const currentTagSlots = weapon.system.tagSlots || {
      slot1: { tagId: null, rank: 1 },
      slot2: { tagId: null, rank: 1 },
    };

    // Find an open slot
    let openSlot = null;
    for (const [slotKey, slot] of Object.entries(currentTagSlots)) {
      if (!slot.tagId) {
        openSlot = slotKey;
        break;
      }
    }

    if (!openSlot) {
      ui.notifications.warn('No open tag slots available in this weapon');
      return;
    }

    // Use addTagToSlot to ensure all fields are set
    await weapon.addTagToSlot(tag.id, openSlot);
    ui.notifications.info('Added ' + tag.name + ' to ' + weapon.name);
    this.render(true);
  }

  /**
   * Reorder items based on drop position
   * @param {Item} draggedItem The item being dragged
   * @param {Item} targetItem The item being dropped on
   * @param {HTMLElement} targetElement The target DOM element
   * @private
   */
  async _reorderItems(draggedItem, targetItem, targetElement) {
    const itemsOfType = this.actor.items.filter(
      (item) => item.type === draggedItem.type
    );

    // Determine drop position
    let dropPosition = 'after';
    if (targetElement.classList.contains('drop-before')) {
      dropPosition = 'before';
    } else if (targetElement.classList.contains('drop-after')) {
      dropPosition = 'after';
    }

    // Calculate new position
    const currentPositions = new Map();
    itemsOfType.forEach((item, index) => {
      currentPositions.set(item.id, index);
    });

    const draggedPosition = currentPositions.get(draggedItem.id);
    const targetPosition = currentPositions.get(targetItem.id);

    if (draggedPosition === undefined || targetPosition === undefined) return;

    let newPosition = targetPosition;
    if (dropPosition === 'after') {
      newPosition = targetPosition + 1;
    }

    // Adjust for item removal
    if (draggedPosition < targetPosition) {
      newPosition -= 1;
    }

    // Create new order
    const newOrder = itemsOfType
      .filter((item) => item.id !== draggedItem.id)
      .map((item, index) => ({ item, index }));

    newOrder.splice(newPosition, 0, { item: draggedItem, index: newPosition });

    // Update sort values
    const updateData = newOrder.map(({ item }, index) => ({
      _id: item.id,
      sort: index * 1000,
    }));

    await this.actor.updateEmbeddedDocuments('Item', updateData);

    // Clear the sort state when manual reordering occurs
    await this.actor.update({
      'flags.dasu.itemSortState': null,
    });

    // Update sort button state to show no active sort
    this._updateSortButtonState(null);

    this.render(true);
  }

  /**
   * Move an item to the top of its type list
   * @param {Item} item The item to move
   * @param {string} itemType The type of the item
   * @private
   */
  async _moveItemToTop(item, itemType, itemCategory = null) {
    let itemsOfType;
    if (itemCategory) {
      itemsOfType = this.actor.items.filter(
        (i) => i.type === 'ability' && i.system.category === itemCategory
      );
    } else {
      itemsOfType = this.actor.items.filter((i) => i.type === itemType);
    }

    // Sort items by their current sort value to maintain order
    itemsOfType.sort((a, b) => (a.sort || 0) - (b.sort || 0));

    // Remove the dragged item from the list
    const otherItems = itemsOfType.filter((i) => i.id !== item.id);

    // Create new order: dragged item first, then all other items in their current order
    const newOrder = [item, ...otherItems];

    // Update sort values
    const updateData = newOrder.map((item, index) => ({
      _id: item.id,
      sort: index * 1000,
    }));

    await this.actor.updateEmbeddedDocuments('Item', updateData);

    // Clear the sort state when manual reordering occurs
    await this.actor.update({
      'flags.dasu.itemSortState': null,
    });

    // Update sort button state to show no active sort
    this._updateSortButtonState(null);

    this.render(true);
  }

  /**
   * Prepare data for rendering the Actor sheet
   * @param {Object} options Options which modify how the Actor is rendered
   * @returns {Object} Data for template rendering
   * @override
   */
  getData(options) {
    const context = super.getData(options);

    // Add items data
    context.items = this._prepareItemsList();

    // Add filter state
    context.filterState = this._filterState;

    return context;
  }

  /**
   * Prepare items list data for template rendering
   * @returns {Object} Items data organized by type
   * @private
   */
  _prepareItemsList() {
    const items = this.actor.items;

    // Get all items by type
    const weapons = items
      .filter((item) => item.type === 'weapon')
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));
    const tags = items
      .filter((item) => item.type === 'tag')
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));
    const techniques = items
      .filter(
        (item) =>
          item.type === 'ability' && item.system.category === 'technique'
      )
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));
    const spells = items
      .filter(
        (item) => item.type === 'ability' && item.system.category === 'spell'
      )
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));
    const afflictions = items
      .filter(
        (item) =>
          item.type === 'ability' && item.system.category === 'affliction'
      )
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));
    const restoratives = items
      .filter(
        (item) =>
          item.type === 'ability' && item.system.category === 'restorative'
      )
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));
    const tactics = items
      .filter((item) => item.type === 'tactic')
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));
    const specials = items
      .filter((item) => item.type === 'special')
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));
    const scars = items
      .filter((item) => item.type === 'scar')
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));

    // Add tag data to weapons for slot visualization
    const weaponsWithTagData = weapons.map((weapon) => {
      const weaponData = weapon.toObject();

      // Initialize slot tag data
      weaponData.slotTagData = {
        slot1: null,
        slot2: null,
      };

      // Debug: Log weapon tag slots
      // (removed debug log)
      // Add tag data if tag slots exist
      if (weapon.system.tagSlots) {
        // Handle slot1
        if (
          weapon.system.tagSlots.slot1 &&
          weapon.system.tagSlots.slot1.tagId
        ) {
          const slot = weapon.system.tagSlots.slot1;
          let tag1 = items.get(slot.tagId);
          if (tag1) {
            weaponData.slotTagData.slot1 = tag1.toObject();
          } else if (slot.tagName) {
            weaponData.slotTagData.slot1 = { name: slot.tagName };
          }
        }
        // Handle slot2
        if (
          weapon.system.tagSlots.slot2 &&
          weapon.system.tagSlots.slot2.tagId
        ) {
          const slot = weapon.system.tagSlots.slot2;
          let tag2 = items.get(slot.tagId);
          if (tag2) {
            weaponData.slotTagData.slot2 = tag2.toObject();
          } else if (slot.tagName) {
            weaponData.slotTagData.slot2 = { name: slot.tagName };
          }
        }
      }

      return weaponData;
    });

    return {
      weapons: weaponsWithTagData,
      tags,
      techniques,
      spells,
      afflictions,
      restoratives,
      tactics,
      specials,
      scars,
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    // ... existing code ...
    // (Removed right-click to remove tag handler and related debug logs)
    // Add left-click to open tag sheet from slot using UUID if available
    html.find('.slot-indicator.filled').on('click', (event) => {
      const slotDiv = event.currentTarget;
      const slotKey = slotDiv.dataset.slot;
      const itemId = slotDiv.closest('li.item')?.dataset.itemId;
      if (!itemId || !slotKey) return;
      const weapon = this.actor.items.get(itemId);
      if (!weapon) return;
      const slot = weapon.system.tagSlots?.[slotKey];
      if (!slot || !slot.tagId) return;
      // Try to get the tag by UUID if present
      if (slot.tagUuid) {
        fromUuid(slot.tagUuid).then((foundTag) => {
          if (foundTag && foundTag.sheet) {
            foundTag.sheet.render(true);
          } else {
            ui.notifications.warn('Tag not found by UUID.');
          }
        });
      } else {
        const tag = this.actor.items.get(slot.tagId);
        if (tag && tag.sheet) {
          tag.sheet.render(true);
        } else {
          ui.notifications.warn('Tag not found in actor items.');
        }
      }
    });
    // Expand/collapse item lists
    html.find('.items-header .collapse-toggle').on('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      const header = this.closest('.items-header');
      const itemList = header.nextElementSibling;
      header.classList.toggle('collapsed');
      if (itemList && itemList.classList.contains('item-list')) {
        itemList.classList.toggle('collapsed');
      }
    });
    // Add collapse/expand handlers for item headers (only chevron)
    this.element
      .querySelectorAll('.items-header .collapse-toggle')
      .forEach((chevron) => {
        chevron.removeEventListener('click', this._handleChevronClick);
        chevron.addEventListener('click', this._handleChevronClick.bind(this));
      });
    // Remove header click handler for collapse/expand (handled by chevron only)
    this.element.querySelectorAll('.items-header').forEach((header) => {
      header.removeEventListener('click', this._handleItemHeaderClick);
    });
  }

  // Track drag state globally for the sheet
  _isDragging = false;

  // Add this method to handle chevron clicks
  _handleChevronClick(event) {
    // Prevent toggling if a drag is in progress
    if (this._isDragging) return;
    event.preventDefault();
    event.stopPropagation();
    const header = event.currentTarget.closest('.items-header');
    const itemList = header.nextElementSibling;
    header.classList.toggle('collapsed');
    if (itemList && itemList.classList.contains('item-list')) {
      itemList.classList.toggle('collapsed');
    }
  }

  async _handleSummonedDaemonsHeaderClick(event) {
    event.preventDefault();
    const current =
      (await this.document.getFlag('dasu', 'summonedDaemonsCollapsed')) !==
      false;
    await this.document.setFlag('dasu', 'summonedDaemonsCollapsed', !current);
    this.render();
  }

  /**
   * Open the leveling wizard for this actor
   * @param {Event} event - Button click event
   * @param {HTMLButtonElement} target - Button element
   */
  static async _openLevelingWizard(event, target) {
    try {
      // In ApplicationV2, static methods are bound to the instance
      // so 'this' refers to the current application instance
      const wizard = new LevelingWizard(this.actor);
      await wizard.render(true);
    } catch (error) {
      console.error('Error opening leveling wizard:', error);
      ui.notifications.error(
        'Failed to open leveling wizard. Check console for details.'
      );
    }
  }

  /**
   * Refresh any open leveling wizards for this actor
   */
  _refreshLevelingWizards() {
    if (this.actor.levelingWizards) {
      for (const wizard of this.actor.levelingWizards) {
        if (wizard && typeof wizard.refresh === 'function') {
          wizard.refresh();
        }
      }
    }
  }

  async _onOpenLevelingWizard(event) {
    event.preventDefault();

    try {
      // Validate actor type
      if (!this.actor || this.actor.type !== 'summoner') {
        ui.notifications.warn(
          'Leveling wizard is only available for summoner characters.'
        );
        return;
      }

      // Validate actor ownership
      if (!this.actor.isOwner) {
        ui.notifications.warn(
          'You do not have permission to access the leveling wizard for this character.'
        );
        return;
      }

      // Check if wizard is already open
      if (this.actor.levelingWizards && this.actor.levelingWizards.length > 0) {
        const existingWizard = this.actor.levelingWizards.find(
          (w) => w.rendered
        );
        if (existingWizard) {
          existingWizard.bringToTop();
          return;
        }
      }

      // Open the leveling wizard
      const wizard = new LevelingWizard(this.actor);
      await wizard.render(true);
    } catch (error) {
      console.error('Error opening leveling wizard:', error);
      ui.notifications.error(
        'Failed to open leveling wizard. Check console for details.'
      );
    }
  }

  /**
   * Handle initiative roll button click
   * @param {Event} event - Button click event
   * @param {HTMLButtonElement} target - Button element
   */
  static async _rollInitiative(event, target) {
    event.preventDefault();

    try {
      const combat = game.combat;
      if (!combat) {
        ui.notifications.warn(
          'No active combat encounter found. Initiative rolls are only available during combat.'
        );
        return;
      }

      const combatant = combat.combatants.find(
        (c) => c.actor.id === this.actor.id
      );
      if (!combatant) {
        ui.notifications.warn(
          'This character is not in the current combat encounter.'
        );
        return;
      }

      await Hooks.callAll('dasu.rollInitiative', this.actor);
    } catch (error) {
      console.error('Error rolling initiative:', error);
      ui.notifications.error(
        'Failed to roll initiative. Check console for details.'
      );
    }
  }
}
