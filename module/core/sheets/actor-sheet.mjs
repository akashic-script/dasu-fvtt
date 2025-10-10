import { prepareActiveEffectCategories } from '../../systems/effects/display.mjs';
import { DASUSettings } from '../settings.mjs';
import { registerHandlebarsHelpers } from '../../utils/helpers.mjs';
import { LevelingWizard } from '../../ui/applications/leveling-wizard.mjs';
import { DASURollDialog } from '../../ui/dialogs/roll-dialog.mjs';
import { DASURecruitDialog } from '../../ui/dialogs/recruit-dialog.mjs';
import { ResourceManagerDialog } from '../../ui/dialogs/resource-manager-dialog.mjs';
import { SkillManagerDialog } from '../../ui/dialogs/skill-manager-dialog.mjs';
import { DASU_STATUS_CONDITIONS } from '../../data/shared/status-conditions.mjs';

registerHandlebarsHelpers();

const { api, sheets } = foundry.applications;

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
    this._isSorting = false;
    this._favoriteFilterActive = false;
  }

  /**
   * Available sheet modes.
   */
  static MODES = Object.freeze({
    PREVIEW: 1,
    EDIT: 2,
  });

  /**
   * The mode the sheet is currently in.
   * @type {typeof DASUActorSheet.MODES[keyof typeof DASUActorSheet.MODES]}
   * @protected
   */
  _mode = DASUActorSheet.MODES.PREVIEW;

  /**
   * Is this sheet in Preview Mode?
   * @returns {boolean}
   */
  get isPreviewMode() {
    return this._mode === DASUActorSheet.MODES.PREVIEW;
  }

  /**
   * Is this sheet in Edit Mode?
   * @returns {boolean}
   */
  get isEditMode() {
    return this._mode === DASUActorSheet.MODES.EDIT;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ['dasu', 'actor'],
    position: {
      width: 700,
      height: 950,
    },
    window: {
      resizable: true,
    },
    actions: {
      onEditImage: this._onEditImage,
      viewDoc: this._viewDoc,
      createDoc: this._createDoc,
      copyDoc: this._copyDoc,
      deleteDoc: this._deleteDoc,
      deleteDocNoConfirm: this._deleteDocNoConfirm,
      toggleEffect: this._toggleEffect,
      toggleStatus: this._toggleStatus,
      clearTemporary: this._clearTemporary,
      clearAll: this._clearAll,
      toggleSummoned: this._toggleSummoned,
      removeFromStock: this._removeFromStock,
      toggleFavorite: this._toggleFavorite,
      toggleFavoriteFilter: this._toggleFavoriteFilter,
      toggleMode: this._toggleMode,
      toggleEditMode: this._toggleEditMode,
      toggleDescription: this._toggleDescription,
      roll: this._onRoll,
      increaseAttribute: this._increaseAttribute,
      decreaseAttribute: this._decreaseAttribute,
      openLevelingWizard: this._openLevelingWizard,
      rollInitiative: this._rollInitiative,
      recruit: this._onRecruit,
      openSlotTag: this._openSlotTag,
      toggleItemSection: this._toggleItemSection,
      manageResource: this._manageResource,
      manageSkill: this._manageSkill,
    },
    // Custom property that's merged into `this.options`
    // dragDrop: [{ dragSelector: '.draggable', dropSelector: null }],
    form: {
      submitOnChange: true,
      closeOnSubmit: false,
    },
  };

  /** @override */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);

    // Add edit mode toggle button outside header controls
    if (this.isEditable) {
      const isEditMode = this._mode === DASUActorSheet.MODES.EDIT;
      const toggleButton = this._constructButton({
        label: '',
        classes: [
          'header-control',
          'icon',
          'fa-solid',
          isEditMode ? 'fa-eye' : 'fa-edit',
        ],
        dataset: {
          action: 'toggleMode',
          tooltip: 'DASU.Actor.EditMode.Toggle',
        },
      });
      this.window.controls.after(toggleButton);
    }

    return frame;
  }

  /** @override */
  _getHeaderControls() {
    const controls = super._getHeaderControls();

    // Add "Recruit" button for daemon
    if (this.document.type === 'daemon' && this.isEditable) {
      controls.unshift({
        action: 'recruit',
        icon: 'fas fa-user-plus',
        label: 'Recruit',
        tooltip: 'Recruit new daemon',
      });
    }

    return controls;
  }

  /**
   * Helper method for constructing an HTML button
   */
  _constructButton({
    label = '',
    classes = [],
    dataset = {},
    type = 'button',
    disabled = false,
  }) {
    const button = document.createElement('button');
    button.type = type;
    button.classList.add(...classes);
    button.textContent = label;
    button.disabled = disabled;
    Object.assign(button.dataset, dataset);
    return button;
  }

  /**
   * Update the toggle button icon based on current mode
   */
  _updateToggleButtonIcon() {
    const toggleButton = this.element?.querySelector(
      '[data-action="toggleMode"]'
    );
    if (!toggleButton) return;

    const isEditMode = this._mode === DASUActorSheet.MODES.EDIT;
    toggleButton.classList.remove('fa-edit', 'fa-eye');
    toggleButton.classList.add(isEditMode ? 'fa-eye' : 'fa-edit');
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
    effects: {
      template: 'systems/dasu/templates/actor/effects.hbs',
      scrollable: [''],
    },
  };

  /** @override */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);

    if (this.isEditable) {
      // Handle mode configuration
      if (options.mode) this._mode = options.mode;
      else if (options.renderContext === `create${this.document.documentName}`)
        this._mode = DASUActorSheet.MODES.EDIT;
      else {
        // Sync with existing flag for backward compatibility
        const isEditFlag = this.document.getFlag('dasu', 'editMode') === true;
        this._mode = isEditFlag
          ? DASUActorSheet.MODES.EDIT
          : DASUActorSheet.MODES.PREVIEW;
      }
    }

    // Not all parts always render
    options.parts = ['header', 'tabs'];
    // Don't show the other tabs if only limited view
    if (this.document.limited) return;
    // Control which parts show based on document subtype
    switch (this.document.type) {
      case 'summoner':
        options.parts.push('main', 'biography', 'effects');
        break;
      case 'daemon':
        options.parts.push('main', 'biography', 'effects');
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
      isPlay: this.isPreviewMode,
      isEdit: this.isEditMode,
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

    // Calculate canLevelUp for the leveling wizard button
    const maxLevel = DASUSettings.getMaxLevel();
    const nextLevel = level + 1;
    const levelingWizard = new LevelingWizard(this.actor); // Create a temporary instance to access _calculateLevelProgression
    const levelsData = await levelingWizard._calculateLevelProgression(
      maxLevel
    );
    const nextLevelData = levelsData.find((l) => l.level === nextLevel);

    context.canLevelUp =
      nextLevelData &&
      (context.system.merit || 0) >= nextLevelData.meritRequired &&
      level < maxLevel;

    await this._prepareItems(context);

    // Add all items array for filterItems helper
    context.items = Array.from(this.actor.items);

    // Add system fields for formInput
    context.fields = this.document.schema.fields;
    context.systemFields = this.document.system.schema.fields;

    // Add HTMLField for formInput helper
    context.htmlInputField = new foundry.data.fields.HTMLField();

    // Enrich resistance data for display
    if (context.system.resistances) {
      for (let [k, v] of Object.entries(context.system.resistances)) {
        if (v && typeof v === 'object') {
          v.label = game.i18n.localize(globalThis.DASU.damageTypes[k]) ?? k;
          v.resTypeBase =
            game.i18n.localize(globalThis.DASU.resType[v.base]) ?? v.base;
          v.resTypeBaseAbbr =
            game.i18n.localize(globalThis.DASU.resTypeAbbr[v.base]) ?? v.base;
          v.resTypeCurr =
            game.i18n.localize(globalThis.DASU.resType[v.current]) ?? v.current;
          v.resTypeCurrAbbr =
            game.i18n.localize(globalThis.DASU.resTypeAbbr[v.current]) ??
            v.current;
          v.icon = globalThis.DASU.resIcon[k];
        }
      }
    }

    return context;
  }

  /** @override */
  async _preparePartContext(partId, context, _options) {
    switch (partId) {
      case 'main':
        context.tab = context.tabs[partId];
        // Add filter state to context for conditional rendering in main tab
        context.itemFilterState =
          this.actor.getFlag('dasu', 'itemFilterState') || null;
        context.favoriteFilterActive =
          this.actor.getFlag('dasu', 'favoriteFilterActive') || false;
        // Enrich biography info for display in daemon sidebar
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
        // Add status conditions data
        context.statusConditions = this._prepareStatusConditions();
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
        case 'biography':
          tab.id = 'biography';
          tab.label += 'Biography';
          break;
        case 'effects':
          tab.id = 'effects';
          tab.label += 'Effects';
          break;
        default:
          return tabs;
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
        label: game.i18n.localize('DASU.ManualCleanup'),
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
    for (const uuid of Object.values(levelingData.feature || {})) {
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
   * Toggle between Preview and Edit modes
   */
  static async _toggleMode(event, target) {
    if (!this.isEditable) return;

    this._mode = this.isPreviewMode
      ? DASUActorSheet.MODES.EDIT
      : DASUActorSheet.MODES.PREVIEW;
    await this.document.setFlag(
      'dasu',
      'editMode',
      this._mode === DASUActorSheet.MODES.EDIT
    );
    this._updateToggleButtonIcon();
    this.render();
  }

  static async _toggleEditMode(_event, _target) {
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
    return this.document.getFlag('dasu', 'editMode') === true;
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
    const classes = [];

    // Iterate through items, allocating to containers
    for (let i of this.document.items) {
      // Enrich item description for display
      i.enrichedDescription =
        await foundry.applications.ux.TextEditor.implementation.enrichHTML(
          i.system.description || '',
          {
            secrets: this.document.isOwner,
            rollData: this.actor.getRollData(),
            relativeTo: this.actor,
          }
        );
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
      // Append to specials (available for both summoners and daemons).
      else if (i.type === 'special') {
        specials.push(i);
      }
      // Append to scars (only for summoners, not daemons).
      else if (i.type === 'scar' && this.document.type !== 'daemon') {
        scars.push(i);
      }
      // Append to schemas (only for summoners, not daemons).
      else if (i.type === 'schema' && this.document.type !== 'daemon') {
        schemas.push(i);
      }
      // Append to features (only for summoners, not daemons).
      else if (i.type === 'feature' && this.document.type !== 'daemon') {
        features.push(i);
      }
      // Append to classes (only for summoners, not daemons).
      else if (i.type === 'class' && this.document.type !== 'daemon') {
        classes.push(i);
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
    context.classes = classes.sort((a, b) => (a.sort || 0) - (b.sort || 0));

    // Add summoned daemon items to collections (for summoners only)
    if (this.document.type === 'summoner') {
      const daemonItems = this._getSummonedDaemonItems();

      // Add daemon items to respective collections with special marking
      weapons.push(...daemonItems.weapons);
      tags.push(...daemonItems.tags);
      techniques.push(...daemonItems.techniques);
      spells.push(...daemonItems.spells);
      afflictions.push(...daemonItems.afflictions);
      restoratives.push(...daemonItems.restoratives);
      tactics.push(...daemonItems.tactics);
      specials.push(...daemonItems.specials);
      scars.push(...daemonItems.scars);
      schemas.push(...daemonItems.schemas);
      features.push(...daemonItems.features);
    }

    // Sort again after adding daemon items
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
              system: actor.system,
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

    // Add context menu handlers for status buttons
    this.element
      .querySelectorAll('[data-action="toggleStatus"]')
      .forEach((button) => {
        button.removeEventListener(
          'contextmenu',
          this._handleStatusContextMenu
        );
        button.addEventListener(
          'contextmenu',
          this._handleStatusContextMenu.bind(this)
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

    // Classify items for special border styling (fallback for browsers without :has() support)
    this._classifyItemsForStyling();

    // Set up hook listeners for daemon item updates
    this._setupDaemonItemHooks();

    // Set up items event listeners (search, filter, dropdown, etc.)
    this._setupItemsEventListeners();

    // Set up collapse/expand handlers for item headers using modern event listeners
    this.element
      .querySelectorAll('.items-header .collapse-toggle')
      .forEach((chevron) => {
        chevron.removeEventListener('click', this._handleChevronClick);
        chevron.addEventListener('click', this._handleChevronClick.bind(this));
      });

    // Remove any existing header click handlers to avoid conflicts
    this.element.querySelectorAll('.items-header').forEach((header) => {
      header.removeEventListener('click', this._handleItemHeaderClick);
    });
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
   * Handle context menu (right-click) on status buttons
   * @param {Event} event - The contextmenu event
   * @private
   */
  async _handleStatusContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    const statusId = button.dataset.statusId;

    if (!statusId) return;

    const statusCondition = DASU_STATUS_CONDITIONS[statusId];
    if (!statusCondition) return;

    const isStackable = statusCondition.flags?.dasu?.stackable;

    if (isStackable) {
      const stackId = statusCondition.flags.dasu.stackId;
      await this.actor.removeEffectStack(stackId);
    } else {
      // For non-stackable effects, right-click removes the effect
      const existingEffect = this.actor.effects.find(
        (effect) => effect.statuses && effect.statuses.has(statusId)
      );
      if (existingEffect) {
        await existingEffect.delete();
      }
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
    const itemList = header.nextElementSibling;

    if (itemList && itemList.classList.contains('item-list')) {
      // Toggle collapsed state
      header.classList.toggle('collapsed');
      itemList.classList.toggle('collapsed');
    }
  }

  /**
   * Handle sort option click
   * @param {string} sortType The sort type (alpha-asc, alpha-desc, aptitude-asc, aptitude-desc)
   * @private
   */
  async _handleSortOption(sortType) {
    // Since we're now updating the actor documents, we don't need tab-specific sorting
    // The sort will apply to all items and be reflected in both tabs
    await this._applySortToTab(sortType);
    this._saveSortState(sortType);
  }

  /**
   * Apply sorting using Foundry's Document sorting
   * @param {string} sortType The sort type
   * @private
   */
  async _applySortToTab(sortType) {
    // Set flag to prevent mutation observer from interfering
    this._isSorting = true;

    try {
      // Get all items from the actor
      const allItems = Array.from(this.actor.items);

      // Sort items based on sort type
      allItems.sort((a, b) => {
        const aName = a.name?.toLowerCase() || '';
        const bName = b.name?.toLowerCase() || '';

        if (sortType === 'alpha-asc') {
          return aName.localeCompare(bName);
        } else if (sortType === 'alpha-desc') {
          return bName.localeCompare(aName);
        } else if (
          sortType === 'aptitude-asc' ||
          sortType === 'aptitude-desc'
        ) {
          // Get aptitude values from item system data
          const aAptitude = this._getItemAptitudeValue(a);
          const bAptitude = this._getItemAptitudeValue(b);

          if (sortType === 'aptitude-asc') {
            return aAptitude.value - bAptitude.value;
          } else {
            return bAptitude.value - aAptitude.value;
          }
        }

        return 0;
      });

      // Update sort values for all items
      const updates = allItems.map((item, index) => ({
        _id: item.id,
        sort: index * 100000, // Use large increments to allow for future insertions
      }));

      // Perform the update
      await this.actor.updateEmbeddedDocuments('Item', updates);
    } catch (error) {
      console.error('Error applying sort:', error);
    } finally {
      // Clear sorting flag after a brief delay to allow DOM updates to complete
      setTimeout(() => {
        this._isSorting = false;
      }, 100);
    }
  }

  /**
   * Get aptitude value for an item from its system data
   * @param {Item} item The item to get aptitude for
   * @returns {Object} Parsed aptitude object {govern: string, value: number}
   * @private
   */
  _getItemAptitudeValue(item) {
    // Handle different item types and their aptitude storage patterns
    if (item.system?.aptitudes) {
      // Abilities use aptitudes.type and aptitudes.value
      const aptitudeStr = `${item.system.aptitudes.type.toUpperCase()}-${
        item.system.aptitudes.value
      }`;
      return this._parseAptitudeValue(aptitudeStr);
    } else if (item.system?.govern) {
      // Tactics use govern field (no numeric value, so we'll use govern name and set value to 0)
      return {
        govern: item.system.govern.toLowerCase(),
        value: 0,
      };
    } else {
      // Items without aptitude values (weapons, etc.) sort at the bottom
      return {
        govern: '',
        value: -1,
      };
    }
  }

  /**
   * Save sort state and update button appearance
   * @param {string} sortType The sort type to save
   * @private
   */
  _saveSortState(sortType) {
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
    // Update both sort buttons (main tab and items tab)
    const sortButtons = this.element.querySelectorAll(
      '.items-sort-btn, .items-tab-sort-btn'
    );

    sortButtons.forEach((sortBtn) => {
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
    });
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
   * Sync checkbox states with current filter state
   * @private
   */
  _syncCheckboxStates() {
    // Sync both main and items tab filter dropdowns
    const dropdowns = this.element.querySelectorAll(
      '.items-filter-dropdown, .items-tab-filter-dropdown'
    );

    dropdowns.forEach((dropdown) => {
      if (!dropdown) return;

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
    });
  }

  /**
   * Handle search input events
   * @param {Event} event The input event
   * @private
   */
  _handleSearchInput(event) {
    const searchTerm = event.target.value.toLowerCase().trim();

    // Find which tab contains this search input to get the correct clear button
    const searchContainer = event.target.closest('.search-container');
    const searchClear = searchContainer?.querySelector('.search-clear');

    // Find the current active tab or the tab containing this search input
    const currentTab =
      event.target.closest('[data-tab]') ||
      this.element.querySelector('[data-tab].active') ||
      this.element.querySelector('[data-tab="main"]');

    if (!currentTab) return;

    const items = currentTab.querySelectorAll('.item-list .item');

    // Show/hide clear button in the current search container
    if (searchClear) {
      searchClear.style.display = searchTerm ? 'block' : 'none';
    }

    // Filter items within the current tab
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

    // Find the search container and input in the same container as the clear button
    const searchContainer = event.target.closest('.search-container');
    const searchInput = searchContainer?.querySelector('.items-search-input');
    const searchClear = event.target;

    // Find the tab containing this search container
    const currentTab =
      searchContainer?.closest('[data-tab]') ||
      this.element.querySelector('[data-tab].active') ||
      this.element.querySelector('[data-tab="main"]');

    if (!currentTab || !searchInput) return;

    const items = currentTab.querySelectorAll('.item-list .item');

    // Clear search input
    searchInput.value = '';

    // Hide clear button
    searchClear.style.display = 'none';

    // Show all items within the current tab
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

    // Don't close if we just cleared the filter
    if (this._preventDropdownClose) {
      return;
    }

    const clickedElement = event.target;

    // Handle main tab filter dropdown
    const dropdown = this.element.querySelector('.items-filter-dropdown');
    const filterBtn = this.element.querySelector('.items-filter-btn');
    if (dropdown && dropdown.classList.contains('visible')) {
      if (
        !dropdown.contains(clickedElement) &&
        !filterBtn.contains(clickedElement)
      ) {
        dropdown.classList.remove('visible');
        filterBtn.classList.remove('active');
      }
    }

    // Handle items tab filter dropdown
    const itemsTabDropdown = this.element.querySelector(
      '.items-tab-filter-dropdown'
    );
    const itemsTabFilterBtn = this.element.querySelector(
      '.items-tab-filter-btn'
    );
    if (itemsTabDropdown && itemsTabDropdown.classList.contains('visible')) {
      if (
        !itemsTabDropdown.contains(clickedElement) &&
        !itemsTabFilterBtn.contains(clickedElement)
      ) {
        itemsTabDropdown.classList.remove('visible');
        itemsTabFilterBtn.classList.remove('active');
      }
    }
  }

  /**
   * Apply type filter
   * @param {HTMLElement} dropdown The filter dropdown
   * @param {boolean} closeDropdown Whether to close the dropdown after applying filter
   * @private
   */
  _applyTypeFilter(dropdown, closeDropdown = true) {
    const checkboxes = dropdown.querySelectorAll(
      'input[type="checkbox"]:checked'
    );
    const selectedTypes = Array.from(checkboxes).map((cb) => {
      // Check if checkbox uses 'value' or 'name' attribute
      return cb.value || cb.name;
    });

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

    // Hide dropdown and reset positioning only if requested
    if (closeDropdown) {
      dropdown.classList.remove('visible');
      dropdown.style.top = '';
      dropdown.style.right = '';
      this.element
        .querySelector('.items-filter-btn')
        .classList.remove('active');
    }
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
   * Toggle the favorite filter state
   * @param {Event} _event The originating event
   * @param {HTMLElement} target The target element
   * @private
   */
  static async _toggleFavoriteFilter(_event, _target) {
    // Get the current favorite filter state
    const currentState =
      this.actor.getFlag('dasu', 'favoriteFilterActive') || false;
    const newState = !currentState;

    // Save the state to actor data for persistence
    try {
      await this.actor.update({
        'flags.dasu.favoriteFilterActive': newState,
      });

      // Re-render the sheet to apply the filter and update button appearance
      this.render(false);
    } catch (error) {
      console.error('Error saving favorite filter state:', error);
    }
  }

  /**
   * Apply favorite filtering to all items
   * @private
   */
  _applyFavoriteFilter() {
    // Get both items tab and main tab to handle items in both locations
    const itemsTab = this.element.querySelector('section[data-tab="items"]');
    const mainTab = this.element.querySelector('section[data-tab="main"]');

    // Create array of sections to process
    const sectionsToProcess = [];
    if (itemsTab) sectionsToProcess.push(itemsTab);
    if (mainTab) sectionsToProcess.push(mainTab);

    sectionsToProcess.forEach((section) => {
      const itemLists = section.querySelectorAll('.item-list');

      itemLists.forEach((itemList) => {
        const items = itemList.querySelectorAll('.item');

        items.forEach((itemElement) => {
          const itemId = itemElement.dataset.itemId;
          if (!itemId) return;

          let item = this.actor.items.get(itemId);
          let isFavorite = false;

          // Handle derived daemon items
          if (!item && itemId.startsWith('daemon-')) {
            // Extract original item ID from daemon item ID: daemon-{daemonId}-{originalItemId}
            const parts = itemId.split('-');
            if (parts.length >= 3) {
              const originalItemId = parts.slice(2).join('-'); // Handle IDs that contain dashes
              const originalItem = this.actor.items.get(originalItemId);
              if (originalItem) {
                isFavorite = originalItem.system.favorite || false;
              }
            }
          } else if (item) {
            isFavorite = item.system.favorite || false;
          } else {
            return; // Item not found, skip
          }

          // Show/hide item based on favorite filter state and item's favorite status
          if (this._favoriteFilterActive) {
            // Only show favorited items
            if (isFavorite) {
              itemElement.style.display = '';
            } else {
              itemElement.style.display = 'none';
            }
          } else {
            // Show all items
            itemElement.style.display = '';
          }
        });
      });
    });
  }

  /**
   * Filter items by type
   * @param {string[]} selectedTypes Array of selected item types
   * @private
   */
  _filterItemsByType(selectedTypes) {
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      // Get both items tab and main tab to handle items in both locations
      const itemsTab = this.element.querySelector('section[data-tab="items"]');
      const mainTab = this.element.querySelector('section[data-tab="main"]');

      // Create array of sections to process
      const sectionsToProcess = [];
      if (itemsTab) sectionsToProcess.push(itemsTab);
      if (mainTab) sectionsToProcess.push(mainTab);

      if (sectionsToProcess.length === 0) {
        return;
      }

      // Process each section
      sectionsToProcess.forEach((section) => {
        // Get all item lists within this section
        const itemLists = section.querySelectorAll('.item-list');

        if (itemLists.length === 0) {
          return;
        }

        itemLists.forEach((itemList) => {
          const itemListClass = itemList.classList[1]?.replace('-list', '');

          // Skip filtering for summoned daemons
          if (itemListClass === 'summoned-daemons') {
            return;
          }

          // Map item list class to filter type
          // For ability subcategories, the filter uses the subcategory name
          let filterType = itemListClass;

          // Special handling for ability subcategories
          if (
            ['technique', 'spell', 'affliction', 'restorative'].includes(
              itemListClass
            )
          ) {
            filterType = itemListClass; // These match directly with filter values
          }

          if (selectedTypes.includes(filterType)) {
            // Show this type
            itemList.classList.remove('filtered-out');
            itemList.style.setProperty('display', '', 'important');
          } else {
            // Hide this type
            itemList.classList.add('filtered-out');
            itemList.style.setProperty('display', 'none', 'important');
          }
        });

        // Show/hide headers based on visible item lists within this section
        const headers = section.querySelectorAll('.items-header');

        headers.forEach((header) => {
          const itemType = header.dataset.itemType;
          const systemCategory = header.dataset.systemCategory;
          const itemList = header.nextElementSibling;

          // Skip filtering for summoned daemons header
          if (header.dataset.action === 'toggleSummonedDaemons') {
            return;
          }

          if (itemList && itemList.classList.contains('item-list')) {
            // Skip if the item list is summoned daemons
            if (itemList.classList.contains('summoned-daemons-list')) {
              return;
            }

            // For ability subcategories, use the system category
            // For other types, use the item type
            let filterType = itemType;
            if (itemType === 'ability' && systemCategory) {
              filterType = systemCategory;
            }

            if (selectedTypes.includes(filterType)) {
              header.classList.remove('filtered-out');
              header.style.setProperty('display', '', 'important');
            } else {
              header.classList.add('filtered-out');
              header.style.setProperty('display', 'none', 'important');
            }
          }
        });
      });

      // Reapply sort state after filtering
      const persistedSortState = this.actor.getFlag('dasu', 'itemSortState');
      if (persistedSortState && typeof persistedSortState === 'string') {
        setTimeout(async () => {
          await this._handleSortOption(persistedSortState);
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
  static async _onEditImage(_event, target) {
    const attr = target.dataset.edit;
    const current = foundry.utils.getProperty(this.document, attr);
    return foundry.applications.apps.FilePicker.browse('data', {
      current,
      type: 'image',
      callback: (path) => {
        this.document.update({ [attr]: path });
      },
    });
  }

  /**
   * Renders an embedded document's sheet
   *
   * @this DASUActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _viewDoc(_event, target) {
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
  static async _deleteDoc(_event, target) {
    const doc = this._getEmbeddedDocument(target);

    // Check if this is a stackable effect
    const isStackable = doc.flags?.dasu?.stackable;
    const stackId = doc.flags?.dasu?.stackId;

    if (isStackable && stackId) {
      // For stackable effects, remove one stack instead of deleting entirely
      await this.actor.removeEffectStack(stackId);
    } else {
      // For non-stackable effects, delete as normal
      await doc.delete();
    }
  }

  /**
   * Delete an embedded Document without confirmation (for Edit Mode)
   * @param {PointerEvent} _event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _deleteDocNoConfirm(_event, target) {
    try {
      const doc = this._getEmbeddedDocument(target);

      // Check if this is a stackable effect
      const isStackable = doc.flags?.dasu?.stackable;
      const stackId = doc.flags?.dasu?.stackId;

      if (isStackable && stackId) {
        // For stackable effects, remove one stack instead of deleting entirely
        await this.actor.removeEffectStack(stackId);
      } else {
        // For non-stackable effects, delete as normal
        await doc.delete();
      }
      ui.notifications.info(
        game.i18n.format('DOCUMENT.Deleted', {
          type: doc.documentName,
          name: doc.name,
        })
      );
    } catch (error) {
      console.error('Error deleting document:', error);
      ui.notifications.error(game.i18n.localize('DOCUMENT.DeleteFailure'));
    }
  }

  /**
   * Create a new embedded Document within this parent Document
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _createDoc(_event, target) {
    // Retrieve the configured document class for Item or ActiveEffect
    const docCls = getDocumentClass(target.dataset.documentClass);

    const docData = {
      name: docCls.defaultName({
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
  static async _copyDoc(_event, target) {
    const item = this._getEmbeddedDocument(target);
    if (!item) return;

    const itemData = item.toObject();
    delete itemData._id;
    itemData.name = `${itemData.name} (Copy)`;

    // Clean up flags and system data
    if (itemData.flags?.dasu) {
      delete itemData.flags.dasu.grantedByLeveling;
      delete itemData.flags.dasu.levelingSource;
    }
    if (itemData.type !== 'ability' && itemData.system?.category) {
      delete itemData.system.category;
    }

    const newItem = await Item.create(itemData, { parent: this.actor });
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
  static async _toggleSummoned(_event, target) {
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
  static async _removeFromStock(_event, target) {
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
  static async _toggleEffect(_event, target) {
    const effect = this._getEmbeddedDocument(target);
    await effect.update({ disabled: !effect.disabled });
  }

  /**
   * Toggle a status condition on/off
   *
   * @this DASUActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _toggleStatus(event, target) {
    const statusId = target.dataset.statusId;
    const actor = this.actor;

    if (!statusId || !actor) return;

    const statusCondition = DASU_STATUS_CONDITIONS[statusId];
    if (!statusCondition) return;

    // Check for Ctrl+click to show custom dialog
    if (event.ctrlKey || event.metaKey) {
      const { StatusEffectDialog } = await import(
        '../../ui/dialogs/status-effect-dialog.mjs'
      );
      await StatusEffectDialog.show({
        statusId,
        statusCondition,
        actor,
      });
      return;
    }

    const isStackable = statusCondition.flags?.dasu?.stackable;
    const isRightClick = event.button === 2;

    if (isStackable) {
      // Handle stackable effects
      const stackId = statusCondition.flags.dasu.stackId;

      if (isRightClick) {
        // Right-click: Remove one stack
        await actor.removeEffectStack(stackId);
      } else {
        // Left-click: Add one stack
        const effectData = {
          name: game.i18n.localize(statusCondition.name),
          img: statusCondition.img,
          statuses: [statusId],
          tint: statusCondition.tint,
          origin: actor.uuid,
          duration: foundry.utils.deepClone(statusCondition.duration || {}),
          flags: foundry.utils.deepClone(statusCondition.flags || {}),
        };

        // Add description if it exists
        if (statusCondition.description) {
          effectData.description = game.i18n.localize(
            statusCondition.description
          );
        }

        // Add changes if they exist
        if (statusCondition.changes) {
          effectData.changes = foundry.utils.deepClone(statusCondition.changes);
        }

        // Link rounds to combat (NOT turns - those use custom tracking)
        if (game.combat && effectData.duration?.rounds) {
          effectData.duration.combat = game.combat.id;
          effectData.duration.startRound = game.combat.round;
          effectData.duration.startTurn = game.combat.turn;
        }

        // Set up custom turn tracking
        if (game.combat && effectData.duration?.turns) {
          effectData.flags.dasu = effectData.flags.dasu || {};
          effectData.flags.dasu.remainingTurns = effectData.duration.turns;
          effectData.flags.dasu.linkedCombat = game.combat.id;
          // Nullify duration.turns to prevent Foundry from auto-processing
          effectData.duration.turns = null;
        }

        console.log(
          'DASU | Actor sheet creating stackable effect:',
          effectData
        );
        await actor.addStackableEffect(effectData);
      }
    } else {
      // Handle non-stackable effects (original behavior)
      const existingEffect = actor.effects.find(
        (effect) => effect.statuses && effect.statuses.has(statusId)
      );

      if (existingEffect) {
        // Remove the status condition
        await existingEffect.delete();
      } else {
        // Add the status condition
        const effectData = {
          name: game.i18n.localize(statusCondition.name),
          img: statusCondition.img,
          statuses: [statusId],
          tint: statusCondition.tint,
          origin: actor.uuid,
          duration: foundry.utils.deepClone(statusCondition.duration || {}),
          flags: foundry.utils.deepClone(statusCondition.flags || {}),
        };

        // Add description if it exists
        if (statusCondition.description) {
          effectData.description = game.i18n.localize(
            statusCondition.description
          );
        }

        // Add changes if they exist
        if (statusCondition.changes) {
          effectData.changes = foundry.utils.deepClone(statusCondition.changes);
        }

        // Link rounds to combat (NOT turns - those use custom tracking)
        if (game.combat && effectData.duration?.rounds) {
          effectData.duration.combat = game.combat.id;
          effectData.duration.startRound = game.combat.round;
          effectData.duration.startTurn = game.combat.turn;
        }

        // Set up custom turn tracking
        if (game.combat && effectData.duration?.turns) {
          effectData.flags.dasu = effectData.flags.dasu || {};
          effectData.flags.dasu.remainingTurns = effectData.duration.turns;
          effectData.flags.dasu.linkedCombat = game.combat.id;
          // Nullify duration.turns to prevent Foundry from auto-processing
          effectData.duration.turns = null;
        }

        console.log(
          'DASU | Actor sheet creating non-stackable effect:',
          effectData
        );
        await actor.createEmbeddedDocuments('ActiveEffect', [effectData]);
      }
    }
  }

  /**
   * Clear all temporary status conditions
   *
   * @this DASUActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _clearTemporary(_event, _target) {
    const actor = this.actor;
    if (!actor) return;

    // Find all temporary status effects (effects with duration)
    const temporaryEffects = actor.effects.filter((effect) => {
      // Check if effect has any status conditions and has duration
      return (
        effect.statuses &&
        effect.statuses.size > 0 &&
        (effect.duration?.rounds > 0 ||
          effect.duration?.seconds > 0 ||
          effect.duration?.turns > 0)
      );
    });

    if (temporaryEffects.length > 0) {
      await actor.deleteEmbeddedDocuments(
        'ActiveEffect',
        temporaryEffects.map((e) => e.id)
      );
      ui.notifications.info(
        `Cleared ${temporaryEffects.length} temporary status condition(s).`
      );
    } else {
      ui.notifications.warn('No temporary status conditions to clear.');
    }
  }

  /**
   * Clear all status conditions
   *
   * @this DASUActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _clearAll(_event, _target) {
    const actor = this.actor;
    if (!actor) return;

    // Find all status effects (effects with status conditions)
    const statusEffects = actor.effects.filter(
      (effect) => effect.statuses && effect.statuses.size > 0
    );

    if (statusEffects.length > 0) {
      const confirmed = await Dialog.confirm({
        title: 'Clear All Status Conditions',
        content: `<p>Are you sure you want to clear all ${statusEffects.length} status condition(s)?</p>`,
        defaultYes: false,
      });

      if (confirmed) {
        await actor.deleteEmbeddedDocuments(
          'ActiveEffect',
          statusEffects.map((e) => e.id)
        );
        ui.notifications.info(
          `Cleared all ${statusEffects.length} status condition(s).`
        );
      }
    } else {
      ui.notifications.warn('No status conditions to clear.');
    }
  }

  /**
   * Toggle the favorite status of an item
   *
   * @this DASUActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _toggleFavorite(_event, target) {
    const item = this._getEmbeddedDocument(target);
    if (!item) return;

    const currentFavorite = item.system.favorite || false;
    await item.update({ 'system.favorite': !currentFavorite });
  }

  /**
   * Toggle the description row for an item
   * @param {Event} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _toggleDescription(event, target) {
    // Don't interfere with rollable elements, their children, or item controls
    if (
      event.target.closest('.rollable') ||
      event.target.classList.contains('rollable') ||
      event.target.closest('.item-controls') ||
      event.target.closest('.item-image')
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    // Find the item row
    const itemElement = target.closest('li.item');
    if (!itemElement) return;

    // Find the description row
    const descriptionRow = itemElement.querySelector('.item-description-row');
    if (!descriptionRow) return;

    // Toggle the display
    const isVisible = descriptionRow.style.display !== 'none';
    descriptionRow.style.display = isVisible ? 'none' : 'block';

    // Find the toggle icon (if it exists) and toggle its class
    const toggleIcon = itemElement.querySelector('.description-toggle-icon');
    if (toggleIcon) {
      toggleIcon.classList.toggle('expanded', !isVisible);
    }
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
          (c) => c.actor?.id === this.actor.id
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
            Hooks.callAll(
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
        break;
      case 'actor':
        // Get the daemon actor ID from the target element
        const daemonId = target.closest('[data-actor-id]')?.dataset.actorId;
        if (daemonId) {
          const daemon = game.actors.get(daemonId);
          if (daemon) {
            return this._sendDaemonToChat(daemon);
          }
        }
        break;
      case 'effect':
        const effectElement = target.closest('[data-effect-id]');
        if (effectElement) {
          const effectId = effectElement.dataset.effectId;
          const effect = this.actor.effects.get(effectId);
          if (effect) {
            return this._sendEffectToChat(effect);
          }
        }
        break;
      case 'daemon-attribute':
        // Handle daemon attribute checks
        const daemonActorId = dataset.actorId;
        const attribute = dataset.attribute;
        if (daemonActorId && attribute) {
          const daemon = game.actors.get(daemonActorId);
          if (daemon) {
            // Create a dataset for the daemon's attribute check
            const daemonDataset = {
              roll: dataset.roll,
              label: dataset.label,
              attribute: attribute,
              isDaemon: true, // Flag to indicate this is a daemon roll
            };
            // Open the roll dialog with the daemon as the actor
            try {
              await DASURollDialog.openFromDataset(daemon, daemonDataset);
              return null;
            } catch (error) {
              console.error(
                'DASU | Error opening daemon attribute roll dialog:',
                error
              );
            }
          }
        }
        break;
    }

    // Handle rolls that supply the formula directly.
    if (dataset.roll) {
      let label = dataset.label ? `${dataset.label}` : '';
      let roll = new Roll(dataset.roll, this.actor.getRollData());

      // For DASU success-based rolls (attribute and skill checks) - open dialog
      if (label.includes('Check')) {
        try {
          // Open the roll dialog instead of rolling immediately
          await DASURollDialog.openFromDataset(this.actor, dataset);
          return null; // Dialog handles the roll
        } catch (error) {
          console.error('DASU | Error opening roll dialog:', error);
          // Fall back to legacy roll system
          await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            flavor: label,
            rollMode: game.settings.get('core', 'rollMode'),
          });
          return roll;
        }
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
   * Send a daemon actor to chat as a message card
   * @param {Actor} daemon - The daemon actor to send to chat
   * @returns {Promise<ChatMessage>} The created chat message
   */
  async _sendDaemonToChat(daemon) {
    // Get the daemon's summoned status from the summoner's daemons array
    const isSummoned =
      this.actor.system.daemons?.some(
        (d) => d._id === daemon.id && d.isSummoned
      ) || false;

    // Prepare template data
    const templateData = {
      actor: daemon,
      isSummoned: isSummoned,
      timestamp: Date.now(),
    };

    // Render the daemon card template
    const content = await foundry.applications.handlebars.renderTemplate(
      'systems/dasu/templates/chat/daemon-card.hbs',
      templateData
    );

    // Create the chat message
    const chatData = {
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: content,
      style: foundry.CONST.CHAT_MESSAGE_STYLES.OTHER,
      flags: {
        dasu: {
          type: 'daemon-card',
          daemonId: daemon.id,
          summonerId: this.actor.id,
        },
      },
    };

    return ChatMessage.create(chatData);
  }

  /**
   * Send an active effect to chat as a message card
   * @param {ActiveEffect} effect - The effect to send to chat
   * @returns {Promise<ChatMessage>} The created chat message
   */
  async _sendEffectToChat(effect) {
    // Prepare duration label using custom tracking
    const remainingTurns = effect.flags?.dasu?.remainingTurns;
    const remainingRounds = effect.flags?.dasu?.remainingRounds;
    let durationLabel = effect.duration?.label || 'None';

    if (remainingTurns !== undefined) {
      const turnLabel =
        remainingTurns === 1
          ? game.i18n.localize('DASU.Effect.Turn')
          : game.i18n.localize('DASU.Effect.Turns');
      durationLabel = `${remainingTurns} ${turnLabel}`;
    } else if (remainingRounds !== undefined) {
      const roundLabel =
        remainingRounds === 1
          ? game.i18n.localize('DASU.Effect.Round')
          : game.i18n.localize('DASU.Effect.Rounds');
      durationLabel = `${remainingRounds} ${roundLabel}`;
    }

    // Prepare effect data with enriched description
    const effectData = {
      id: effect.id,
      name: effect.name,
      img: effect.img,
      description:
        await foundry.applications.ux.TextEditor.implementation.enrichHTML(
          effect.description || '',
          {
            relativeTo: effect,
            rollData: this.actor.getRollData(),
          }
        ),
      disabled: effect.disabled,
      sourceName: effect.sourceName || effect.parent?.name || 'Unknown',
      duration: {
        ...effect.duration,
        label: durationLabel,
      },
      specialDurationLabel: effect.flags?.dasu?.specialDuration?.label,
      stackCount: effect.flags?.dasu?.stacks?.count,
      changes: effect.changes.map((change) => ({
        key: change.key,
        mode: change.mode,
        value: change.value,
      })),
    };

    // Prepare template data
    const templateData = {
      effect: effectData,
      timestamp: Date.now(),
    };

    // Render the effect card template
    const content = await foundry.applications.handlebars.renderTemplate(
      'systems/dasu/templates/chat/effect-card.hbs',
      templateData
    );

    // Create the chat message
    const chatData = {
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: content,
      style: foundry.CONST.CHAT_MESSAGE_STYLES.OTHER,
      flags: {
        dasu: {
          type: 'effect-card',
          effectId: effect.id,
          actorId: this.actor.id,
        },
      },
    };

    return ChatMessage.create(chatData);
  }

  /**
   * Fetches the embedded document representing the containing HTML element
   *
   * @param {HTMLElement} target    The element subject to search
   * @returns {Item | ActiveEffect | Actor} The embedded Item, ActiveEffect, or Actor
   */
  _getEmbeddedDocument(target) {
    const docRow = target.closest('li[data-document-class]');
    if (docRow.dataset.documentClass === 'Item') {
      const itemId = docRow.dataset.itemId;

      // Check if this is a daemon-derived item
      if (itemId && itemId.startsWith('daemon-')) {
        return this._getDaemonDerivedItem(itemId);
      }

      return this.actor.items.get(itemId);
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
    const sortUpdates = foundry.utils.sortObjectEntries(effect, {
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
  async _onDropActor(_event, data) {
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

    // Find or create "Recruited" folder
    let recruitedFolder = game.folders.find(
      (f) => f.name === 'Recruited' && f.type === 'Actor'
    );
    if (!recruitedFolder) {
      recruitedFolder = await Folder.create({
        name: 'Recruited',
        type: 'Actor',
        parent: null,
      });
    }

    // Clone the daemon into the Recruited folder
    let clonedDaemon;
    if (actor.pack) {
      // If from compendium, create a new actor in the world
      const actorData = actor.toObject();
      clonedDaemon = await Actor.create({
        ...actorData,
        folder: recruitedFolder.id,
        'prototypeToken.disposition': 1,
        'prototypeToken.actorLink': true,
      });
    } else {
      // If from world, clone normally
      clonedDaemon = await actor.clone(
        {
          name: actor.name,
          folder: recruitedFolder.id,
          'prototypeToken.disposition': 1,
          'prototypeToken.actorLink': true,
        },
        { save: true }
      );
    }

    // Add cloned daemon to stocks
    const newStock = {
      references: {
        actor: clonedDaemon.id,
        isSummoned: false,
      },
    };

    const updatedStocks = [...stocks, newStock];
    await this.actor.update({ 'system.stocks': updatedStocks });

    ui.notifications.info(`Added ${clonedDaemon.name} to your stocks`);

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
  async _onDropItemCreate(itemData, _event) {
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
  async _processSubmitData(_event, _form, submitData) {
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
  static async _increaseAttribute(_event, target) {
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
  static async _decreaseAttribute(_event, target) {
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

    // Clean up context menu
    if (this._itemContextMenu) {
      try {
        // Only try to close if the context menu's element still exists
        if (this._itemContextMenu.element) {
          this._itemContextMenu.close();
        }
      } catch (e) {
        // Silently ignore errors during cleanup
      }
      this._itemContextMenu = null;
    }

    // Clean up daemon item hook listeners
    this._cleanupDaemonItemHooks();

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

    // Find the dropdown that contains the clicked button
    const dropdown = event.target.closest(
      '.items-filter-dropdown, .items-tab-filter-dropdown'
    );
    if (!dropdown) return;

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

    // Find the dropdown that contains the clicked button
    const dropdown = event.target.closest(
      '.items-filter-dropdown, .items-tab-filter-dropdown'
    );
    if (!dropdown) return;

    this._applyTypeFilter(dropdown);
  }

  /**
   * Handle clear filter button click
   * @param {Event} event The click event
   * @private
   */
  _handleClearFilter(event) {
    event.stopPropagation();

    // Find the dropdown that contains the clicked button
    const dropdown = event.target.closest(
      '.items-filter-dropdown, .items-tab-filter-dropdown'
    );
    if (!dropdown) return;

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
      setTimeout(async () => {
        // Apply sort to both tabs since the sort state is global
        await this._handleSortOption(persistedSortState);
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
      // Don't trigger filtering during sorting operations
      if (this._isSorting) return;

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

    // Initialize favorite filter state
    const persistedFavoriteState = this.actor.getFlag(
      'dasu',
      'favoriteFilterActive'
    );
    if (persistedFavoriteState) {
      this._favoriteFilterActive = persistedFavoriteState;

      setTimeout(() => {
        this._applyFavoriteFilter();
      }, 60);
    }
  }

  /**
   * Setup Foundry ContextMenu for sort button
   * @param {string} btnSelector CSS selector for the sort button
   * @param {string} filterBtnSelector CSS selector for the filter button (to close when opening sort)
   * @param {string} filterDropdownSelector CSS selector for the filter dropdown (to close when opening sort)
   * @private
   */
  _setupSortButton(btnSelector, filterBtnSelector, filterDropdownSelector) {
    const sortBtn = this.element.querySelector(btnSelector);
    const filterBtn = this.element.querySelector(filterBtnSelector);
    const filterDropdown = this.element.querySelector(filterDropdownSelector);

    if (!sortBtn) return;

    // Define sort options for the context menu
    const sortMenuOptions = [
      {
        name: 'DASU.Sort.AlphabeticalAsc',
        icon: '<i class="fas fa-sort-alpha-down"></i>',
        callback: () => this._handleSortOption('alpha-asc'),
      },
      {
        name: 'DASU.Sort.AlphabeticalDesc',
        icon: '<i class="fas fa-sort-alpha-up"></i>',
        callback: () => this._handleSortOption('alpha-desc'),
      },
      {
        name: 'DASU.Sort.AptitudeAsc',
        icon: '<i class="fas fa-sort-numeric-down"></i>',
        callback: () => this._handleSortOption('aptitude-asc'),
      },
      {
        name: 'DASU.Sort.AptitudeDesc',
        icon: '<i class="fas fa-sort-numeric-up"></i>',
        callback: () => this._handleSortOption('aptitude-desc'),
      },
      {
        name: 'DASU.Sort.ClearSort',
        icon: '<i class="fas fa-times"></i>',
        callback: () => this._clearSortState(),
      },
    ];

    // Initialize Foundry ContextMenu for sort button
    new foundry.applications.ux.ContextMenu.implementation(
      this.element,
      btnSelector,
      sortMenuOptions,
      {
        eventName: 'click',
        jQuery: false,
        onOpen: (_menu) => {
          // Close filter dropdown if open
          if (filterDropdown && filterDropdown.classList.contains('visible')) {
            filterDropdown.classList.remove('visible');
            filterBtn?.classList.remove('active');
          }

          // Add active state to sort button
          sortBtn.classList.add('active');
        },
        onClose: () => {
          // Remove active state from sort button
          sortBtn.classList.remove('active');

          // Remove context menu theming
          this._removeContextMenuTheme();
        },
        fixed: true,
      }
    );
  }

  /**
   * Setup filter button using DialogV2 for a better user interface
   * @param {string} btnSelector CSS selector for the filter button
   * @param {string} sortBtnSelector CSS selector for the sort button (to close)
   * @private
   */
  _setupFilterButton(btnSelector, sortBtnSelector) {
    const filterBtn = this.element.querySelector(btnSelector);
    const sortBtn = this.element.querySelector(sortBtnSelector);

    if (!filterBtn) return;

    // Setup click handler to open DialogV2
    filterBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      event.preventDefault();

      // Close sort context menu if open
      const sortContextMenu = document.querySelector('nav#context-menu');
      if (sortContextMenu) {
        sortContextMenu.remove();
      }
      if (sortBtn) {
        sortBtn.classList.remove('active');
      }

      // Open filter dialog
      this._openFilterDialog();
    });
  }

  /**
   * Open the filter dialog using DialogV2
   * @private
   */
  async _openFilterDialog() {
    const allTypes = [
      'weapon',
      'tag',
      'technique',
      'spell',
      'affliction',
      'restorative',
      'tactic',
      'special',
      'scar',
      'schema',
      'feature',
      'class',
    ];
    const visibleTypes =
      this.actor.getFlag('dasu', 'itemFilterState') || allTypes;

    const filterTypes = [
      { value: 'weapon', name: 'DASU.Filter.Weapons', icon: 'fas fa-sword' },
      { value: 'tag', name: 'DASU.Filter.Tags', icon: 'fas fa-tag' },
      {
        value: 'technique',
        name: 'DASU.Filter.Techniques',
        icon: 'fas fa-fist-raised',
      },
      { value: 'spell', name: 'DASU.Filter.Spells', icon: 'fas fa-magic' },
      {
        value: 'affliction',
        name: 'DASU.Filter.Afflictions',
        icon: 'fas fa-skull',
      },
      {
        value: 'restorative',
        name: 'DASU.Filter.Restoratives',
        icon: 'fas fa-heart',
      },
      { value: 'tactic', name: 'DASU.Filter.Tactics', icon: 'fas fa-chess' },
      { value: 'special', name: 'DASU.Filter.Specials', icon: 'fas fa-star' },
      { value: 'scar', name: 'DASU.Filter.Scars', icon: 'fas fa-scar' },
      { value: 'schema', name: 'DASU.Filter.Schemas', icon: 'fas fa-cube' },
      { value: 'feature', name: 'DASU.Filter.Features', icon: 'fas fa-gem' },
      {
        value: 'class',
        name: 'DASU.Filter.Classes',
        icon: 'fas fa-graduation-cap',
      },
    ];

    // Generate checkboxes HTML
    const checkboxes = filterTypes
      .map((type) => {
        const isVisible = visibleTypes.includes(type.value);
        return `
        <label class="filter-option" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem; cursor: pointer; border-radius: 0; transition: all 0.2s ease; margin-bottom: 0.25rem;">
          <input type="checkbox" name="${type.value}" ${
          isVisible ? 'checked' : ''
        } style="margin-right: 0.5rem;">
          <i class="${type.icon}" style="width: 16px; text-align: center;"></i>
          <span>${game.i18n.localize(type.name)}</span>
        </label>
      `;
      })
      .join('');

    const content = `
      <div style="display: flex; flex-direction: column; gap: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <h3 style="margin: 0; font-size: 1rem; color: var(--dasu-c-dark);">${game.i18n.localize(
            'DASU.Filter.Title'
          )}</h3>
          <button type="button" id="select-all-toggle" style="background: none; border: 1px solid var(--color-primary); color: var(--color-primary); padding: 0.25rem 0.5rem; cursor: pointer; border-radius: 0; font-size: 0.8rem;">
            ${game.i18n.localize('DASU.Filter.SelectAll')}
          </button>
        </div>
        <div style="max-height: 300px; overflow-y: auto; padding: 0.5rem; border: 1px solid var(--color-border); background: var(--color-bg-primary);">
          ${checkboxes}
        </div>
      </div>
    `;

    const dialog = new foundry.applications.api.DialogV2({
      window: {
        title: game.i18n.localize('DASU.Filter.Title'),
        icon: 'fas fa-filter',
      },
      content: content,
      buttons: [
        {
          action: 'apply',
          label: game.i18n.localize('DASU.Filter.Apply'),
          default: true,
          callback: (_, button) => this._applyFilterDialog(button.form),
        },
        {
          action: 'clear',
          label: game.i18n.localize('DASU.Filter.Clear'),
          callback: (_, __, dialog) => {
            // Clear all filters
            this._clearAllFilters();

            // Update dialog checkboxes to show all are selected
            const checkboxes = dialog.element.querySelectorAll(
              'input[type="checkbox"]'
            );
            checkboxes.forEach((cb) => (cb.checked = true));

            // Update select all button text
            const selectAllBtn =
              dialog.element.querySelector('#select-all-toggle');
            if (selectAllBtn) {
              selectAllBtn.textContent = game.i18n.localize(
                'DASU.Filter.DeselectAll'
              );
            }

            // Return false to prevent dialog from closing
            return false;
          },
        },
        {
          action: 'cancel',
          label: game.i18n.localize('Cancel'),
          callback: () => {}, // Just close the dialog
        },
      ],
      modal: true,
      position: {
        width: 400,
        height: 'auto',
      },
    });

    const result = await dialog.render(true);

    // Setup select all toggle after dialog renders
    setTimeout(() => {
      const selectAllBtn = dialog.element.querySelector('#select-all-toggle');
      const checkboxes = dialog.element.querySelectorAll(
        'input[type="checkbox"]'
      );

      if (selectAllBtn && checkboxes.length > 0) {
        // Update button text based on current state
        const updateSelectAllButton = () => {
          const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
          selectAllBtn.textContent = allChecked
            ? game.i18n.localize('DASU.Filter.DeselectAll')
            : game.i18n.localize('DASU.Filter.SelectAll');
        };

        // Initial button text
        updateSelectAllButton();

        // Handle select all click
        selectAllBtn.addEventListener('click', () => {
          const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
          checkboxes.forEach((cb) => (cb.checked = !allChecked));
          updateSelectAllButton();
        });

        // Update button text when individual checkboxes change
        checkboxes.forEach((cb) => {
          cb.addEventListener('change', () => {
            updateSelectAllButton();
            // Apply filter immediately when checkbox changes
            this._applyFilterDialog(dialog.element.querySelector('form'));
          });
        });
      }
    }, 50);

    return result;
  }

  /**
   * Apply filter settings from dialog form
   * @param {HTMLFormElement} form The dialog form
   * @private
   */
  _applyFilterDialog(form) {
    const formData = new FormData(form);
    const checkedTypes = [];

    // Process all checkbox values
    const allTypes = [
      'weapon',
      'tag',
      'technique',
      'spell',
      'affliction',
      'restorative',
      'tactic',
      'special',
      'scar',
      'schema',
      'feature',
      'class',
    ];

    allTypes.forEach((type) => {
      if (formData.has(type)) {
        checkedTypes.push(type);
      }
    });

    // Store filter state using the same mechanism as dropdown approach
    this._typeFilterState = checkedTypes;

    // Save filter state to actor data for persistence (same as dropdown approach)
    this.actor
      .update({
        'flags.dasu.itemFilterState': checkedTypes,
      })
      .catch((error) => {
        console.error('Error saving filter state:', error);
      });

    // Apply filter to items immediately using the existing method
    this._filterItemsByType(checkedTypes);
  }

  /**
   * Clear all filters (show all types)
   * @private
   */
  _clearAllFilters() {
    // Clear filter state using the same mechanism as dropdown approach
    this._typeFilterState = null;

    // Clear persisted filter state from actor data
    this.actor
      .update({
        'flags.dasu.itemFilterState': null,
      })
      .catch((error) => {
        console.error('Error clearing filter state:', error);
      });

    // Show all items by calling the existing method
    this._resetItemsDisplay();
  }

  /**
   * Setup event listeners for a filter dropdown
   * @param {string} selector CSS selector for the dropdown
   * @private
   */
  _setupFilterDropdown(selector) {
    const dropdown = this.element.querySelector(selector);
    if (!dropdown) return;

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

    // Add checkbox change listeners for immediate filtering
    const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach((checkbox) => {
      checkbox.addEventListener('change', (event) => {
        event.stopPropagation();
        // Apply filter immediately when checkbox state changes, but don't close dropdown
        this._applyTypeFilter(dropdown, false);
      });
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
        // Call the hotbar macro drag handler first
        this._onDragStart(event);
        // Then call the sort handler
        if (this._boundHandleSortStart) this._boundHandleSortStart(event);
      });
      item.addEventListener('dragend', (_event) => {
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

    // Setup filter dropdowns
    this._setupFilterDropdown('.items-filter-dropdown');
    this._setupFilterDropdown('.items-tab-filter-dropdown');

    // Setup sort and filter buttons
    this._setupSortButton(
      '.items-sort-btn',
      '.items-filter-btn',
      '.items-filter-dropdown'
    );
    this._setupFilterButton('.items-filter-btn', '.items-sort-btn');
    this._setupSortButton(
      '.items-tab-sort-btn',
      '.items-tab-filter-btn',
      '.items-tab-filter-dropdown'
    );
    this._setupFilterButton('.items-tab-filter-btn', '.items-tab-sort-btn');

    // Setup item context menus
    this._setupItemContextMenus();

    // Set up mutation observer to watch for DOM changes
    if (!this._mutationObserver) {
      this._setupMutationObserver();
    }
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

  /**
   * Handle the beginning of a drag workflow for Items within the Actor
   * @param {DragEvent} event   The originating drag event
   * @protected
   */
  _onDragStart(event) {
    const li = event.currentTarget;
    if ('link' in event.target.dataset) return;

    let dragData;

    // Owned Items
    if (li.dataset.itemId) {
      const item = this.actor.items.get(li.dataset.itemId);
      dragData = item.toDragData();
    }

    if (!dragData) return;

    // Set data transfer
    event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
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

  /**
   * Prepare status conditions data for template rendering
   * @returns {Object} Status conditions with active state
   * @private
   */
  _prepareStatusConditions() {
    const statusConditions = {};
    const activeEffects = this.actor.effects;

    // Create status condition objects with active state
    for (const [id, condition] of Object.entries(DASU_STATUS_CONDITIONS)) {
      const isActive = activeEffects.some(
        (effect) => effect.statuses && effect.statuses.has(id)
      );

      statusConditions[id] = {
        ...condition,
        name: game.i18n.localize(condition.name),
        description: game.i18n.localize(condition.description),
        active: isActive,
      };
    }

    return statusConditions;
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
   * Open the resource manager dialog
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Target element
   */
  static async _manageResource(event, target) {
    const resourceType =
      target.dataset.resource || target.closest('.bar-meter')?.dataset.resource;
    if (!resourceType) return;

    await ResourceManagerDialog.open(this.actor, resourceType);
  }

  /**
   * Open skill manager dialog
   * @param {Event} event - Button click event
   * @param {HTMLElement} target - Button element
   */
  static async _manageSkill(event, target) {
    event.preventDefault();
    event.stopPropagation();

    const skillIndex = parseInt(target.dataset.skillIndex);
    if (isNaN(skillIndex)) return;

    await SkillManagerDialog.open(this.actor, skillIndex);
  }

  /**
   * Open the leveling wizard for this actor
   * @param {Event} event - Button click event
   * @param {HTMLButtonElement} target - Button element
   */
  static async _openLevelingWizard(_event, _target) {
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
        ui.notifications.warn(game.i18n.localize('DASU.NoPermissionToModify'));
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
   * Open initiative roll dialog
   */
  async openInitiativeDialog() {
    // Create initiative-specific dialog data
    const initialData = {
      rollType: 'initiative',
      primaryAttribute: 'dex',
      initiativeType: 'dex',
      diceMod: 0,
      label: game.i18n.localize('DASU.InitiativeRoll'),
    };

    const dialog = new DASURollDialog(this.actor, initialData);
    return dialog.render(true);
  }

  /**
   * Handle recruit button click
   * @param {Event} event - Button click event
   */
  static async _onRecruit(event) {
    event.preventDefault();

    const actor = this.actor;

    // Only daemons can be recruited
    if (actor.type !== 'daemon') {
      ui.notifications.warn(
        game.i18n.localize('DASU.Actor.Recruit.OnlyDaemonsCanBeRecruited')
      );
      return;
    }

    // Open the recruit dialog
    new DASURecruitDialog(actor).render(true);
  }

  /**
   * Handle initiative roll button click
   * @param {Event} event - Button click event
   */
  static async _rollInitiative(event) {
    event.preventDefault();

    try {
      const combat = game.combat;
      if (!combat) {
        ui.notifications.warn(game.i18n.localize('DASU.NoActiveCombat'));
        return;
      }

      const combatant = combat.combatants.find(
        (c) => c.actor?.id === this.actor.id
      );
      if (!combatant) {
        ui.notifications.warn(
          'This character is not in the current combat encounter.'
        );
        return;
      }

      // Open initiative dialog instead of auto-rolling
      await this.openInitiativeDialog();
    } catch (error) {
      console.error('Error rolling initiative:', error);
      ui.notifications.error(
        'Failed to roll initiative. Check console for details.'
      );
    }
  }

  /**
   * Get items from summoned daemons
   * @returns {Object} Categorized daemon items
   * @private
   */
  _getSummonedDaemonItems() {
    const daemonItems = {
      weapons: [],
      tags: [],
      techniques: [],
      spells: [],
      afflictions: [],
      restoratives: [],
      tactics: [],
      specials: [],
      scars: [],
      schemas: [],
      features: [],
    };

    if (this.document.type !== 'summoner') return daemonItems;

    // Get summoned daemons from stocks
    const stocks = this.document.system.stocks || [];

    for (const stock of stocks) {
      // Only include items from summoned daemons
      if (stock.references?.actor && stock.references?.isSummoned) {
        const daemonActor = game.actors.get(stock.references.actor);
        if (daemonActor && daemonActor.type === 'daemon') {
          // Process each item from the daemon
          for (const item of daemonActor.items) {
            const daemonItem = this._createDaemonDerivedItem(item, daemonActor);

            // Categorize the daemon item
            if (item.type === 'ability') {
              if (item.system.category === 'spell') {
                daemonItems.spells.push(daemonItem);
              } else if (item.system.category === 'affliction') {
                daemonItems.afflictions.push(daemonItem);
              } else if (item.system.category === 'restorative') {
                daemonItems.restoratives.push(daemonItem);
              } else if (item.system.category === 'technique') {
                daemonItems.techniques.push(daemonItem);
              }
            } else if (item.type === 'weapon') {
              daemonItems.weapons.push(daemonItem);
            } else if (item.type === 'tag') {
              daemonItems.tags.push(daemonItem);
            } else if (item.type === 'tactic') {
              daemonItems.tactics.push(daemonItem);
            } else if (item.type === 'special') {
              daemonItems.specials.push(daemonItem);
            } else if (item.type === 'scar') {
              daemonItems.scars.push(daemonItem);
            } else if (item.type === 'schema') {
              daemonItems.schemas.push(daemonItem);
            } else if (item.type === 'feature') {
              daemonItems.features.push(daemonItem);
            }
          }
        }
      }
    }

    return daemonItems;
  }

  /**
   * Create a daemon-derived item proxy with special properties
   * @param {Item} originalItem - The original daemon item
   * @param {Actor} daemonActor - The daemon actor that owns the item
   * @returns {Object} Daemon-derived item proxy
   * @private
   */
  _createDaemonDerivedItem(originalItem, daemonActor) {
    // Create a proxy object that behaves like an item but has special properties
    const daemonItem = {
      ...originalItem,
      _id: `daemon-${daemonActor.id}-${originalItem.id}`, // Unique ID for daemon items
      name: originalItem.name,
      img: originalItem.img,
      type: originalItem.type,
      system: originalItem.system,
      flags: {
        ...originalItem.flags,
        dasu: {
          ...originalItem.flags?.dasu,
          isDaemonDerived: true,
          sourceDaemon: {
            id: daemonActor.id,
            name: daemonActor.name,
            img: daemonActor.img,
          },
        },
      },
      sort: (originalItem.sort || 0) + 10000, // Sort daemon items after regular items

      // Add special properties for template usage
      isDaemonDerived: true,
      sourceDaemonName: daemonActor.name,
      sourceDaemonImg: daemonActor.img,

      // Override traits to mark as daemon-derived
      traits: [...(originalItem.traits || []), 'daemon-derived'],
    };

    return daemonItem;
  }

  /**
   * Get a daemon-derived item by its virtual ID
   * @param {string} virtualItemId - The virtual item ID (daemon-{daemonId}-{itemId})
   * @returns {Item|null} The actual daemon item or null if not found
   * @private
   */
  _getDaemonDerivedItem(virtualItemId) {
    // Parse the virtual ID: daemon-{daemonId}-{itemId}
    const match = virtualItemId.match(/^daemon-(.+)-(.+)$/);
    if (!match) return null;

    const [, daemonId, originalItemId] = match;

    // Get the daemon actor
    const daemonActor = game.actors.get(daemonId);
    if (!daemonActor) return null;

    // Get the original item from the daemon
    const originalItem = daemonActor.items.get(originalItemId);
    if (!originalItem) return null;

    // Verify the daemon is actually summoned by this summoner
    const stocks = this.document.system.stocks || [];
    const daemonStock = stocks.find(
      (stock) =>
        stock.references?.actor === daemonId && stock.references?.isSummoned
    );

    if (!daemonStock) return null;

    return originalItem;
  }

  /**
   * Set up hook listeners for daemon item updates
   * @private
   */
  _setupDaemonItemHooks() {
    // Remove any existing hook listeners for this sheet
    this._cleanupDaemonItemHooks();

    // Only set up hooks for summoners
    if (this.document.type !== 'summoner') return;

    // Get all daemon IDs that this summoner has summoned
    const summonedDaemonIds = this._getSummonedDaemonIds();

    if (summonedDaemonIds.length === 0) return;

    // Listen for item updates on daemon actors
    this._itemUpdateHook = Hooks.on('updateItem', (item) => {
      // Check if the updated item belongs to one of our summoned daemons
      if (summonedDaemonIds.includes(item.parent?.id)) {
        // Refresh this sheet to show the updated daemon-derived item
        this.render();
      }
    });
  }

  /**
   * Clean up daemon item hook listeners
   * @private
   */
  _cleanupDaemonItemHooks() {
    if (this._itemUpdateHook) {
      Hooks.off('updateItem', this._itemUpdateHook);
      this._itemUpdateHook = null;
    }
  }

  /**
   * Get IDs of all summoned daemons for this summoner
   * @returns {string[]} Array of daemon actor IDs
   * @private
   */
  _getSummonedDaemonIds() {
    if (this.document.type !== 'summoner') return [];

    const stocks = this.document.system.stocks || [];
    return stocks
      .filter(
        (stock) => stock.references?.actor && stock.references?.isSummoned
      )
      .map((stock) => stock.references.actor);
  }

  /**
   * Classify items for special border styling
   * Adds CSS classes for browsers that don't support :has() selector
   * @private
   */
  _classifyItemsForStyling() {
    // Find all item elements
    this.element
      .querySelectorAll('.items-list .item[data-item-id]')
      .forEach((itemElement) => {
        // Remove existing classification classes
        itemElement.classList.remove(
          'innate-item',
          'leveling-granted-item',
          'daemon-derived'
        );

        // Check if item has innate badge
        const hasInnateBadge = itemElement.querySelector('.innate-badge');

        // Check if item has fa-eye icon (indicating view-only/granted status)
        const hasEyeIcon = itemElement.querySelector('.item-edit .fa-eye');

        // Get item ID to check if it's a daemon-derived item
        const itemId = itemElement.dataset.itemId;
        const isDaemonDerived = itemId && itemId.startsWith('daemon-');

        if (hasInnateBadge) {
          // Item has innate badge - add innate class
          itemElement.classList.add('innate-item');
        } else if (isDaemonDerived) {
          // Item ID indicates it's daemon-derived - add daemon-derived class
          itemElement.classList.add('daemon-derived');
        } else if (hasEyeIcon) {
          // Item has eye icon but no innate badge - must be leveling-granted
          itemElement.classList.add('leveling-granted-item');
        }
      });
  }

  /**
   * Action handler for opening slot tag sheets
   * @param {Event} event - Click event
   * @param {HTMLElement} target - The clicked element
   */
  static async _openSlotTag(_event, target) {
    const slotDiv = target.closest('.slot-indicator.filled');
    if (!slotDiv) return;

    const slotKey = slotDiv.dataset.slot;
    const itemId = slotDiv.closest('li.item')?.dataset.itemId;
    if (!itemId || !slotKey) return;

    const weapon = this.actor.items.get(itemId);
    if (!weapon) return;

    const slot = weapon.system.tagSlots?.[slotKey];
    if (!slot || !slot.tagId) return;

    // Try to get the tag by UUID if present
    if (slot.tagUuid) {
      const foundTag = await fromUuid(slot.tagUuid);
      if (foundTag && foundTag.sheet) {
        foundTag.sheet.render(true);
      } else {
        ui.notifications.warn('Tag not found by UUID.');
      }
    } else {
      const tag = this.actor.items.get(slot.tagId);
      if (tag && tag.sheet) {
        tag.sheet.render(true);
      } else {
        ui.notifications.warn('Tag not found in actor items.');
      }
    }
  }

  /**
   * Action handler for toggling item section collapse/expand
   * @param {Event} event - Click event
   * @param {HTMLElement} target - The clicked element
   */
  static async _toggleItemSection(event, target) {
    // Prevent toggling if a drag is in progress
    if (this._isDragging) return;

    event.preventDefault();
    event.stopPropagation();

    const header = target.closest('.items-header');
    const itemList = header?.nextElementSibling;

    if (header) {
      header.classList.toggle('collapsed');
    }

    if (itemList && itemList.classList.contains('item-list')) {
      itemList.classList.toggle('collapsed');
    }
  }

  /**
   * Apply standardized theming to context menu
   * @param {string} theme Theme variant: 'standard', 'compact', 'wide'
   * @param {Object} options Additional theme options
   * @private
   */
  _applyContextMenuTheme(theme = 'standard', options = {}) {
    const contextMenu = document.querySelector('nav#context-menu');
    if (!contextMenu) return;

    // Remove any existing theme classes
    this._removeContextMenuTheme();

    // Apply base theme class
    contextMenu.classList.add('dasu-context-menu');

    // Apply specific theme variant
    if (theme) {
      contextMenu.classList.add(theme);
    }

    // Apply custom classes if provided
    if (options.customClasses) {
      const customClasses = Array.isArray(options.customClasses)
        ? options.customClasses
        : [options.customClasses];
      contextMenu.classList.add(...customClasses);
    }
  }

  /**
   * Remove all context menu theming classes
   * @private
   */
  _removeContextMenuTheme() {
    const contextMenu = document.querySelector('nav#context-menu');
    if (!contextMenu) return;

    // Remove all theme classes
    const themeClasses = ['dasu-context-menu', 'standard', 'compact', 'wide'];

    contextMenu.classList.remove(...themeClasses);
  }

  /**
   * Create a standardized context menu with theming
   * @param {string} selector Button selector for the context menu
   * @param {Array} menuOptions Menu options array
   * @param {string} theme Theme variant: 'standard', 'compact', 'wide'
   * @param {Object} contextMenuOptions Additional ContextMenu options
   * @returns {ContextMenu} The created context menu instance
   */
  _createThemedContextMenu(
    selector,
    menuOptions,
    theme = 'standard',
    contextMenuOptions = {}
  ) {
    const defaultOptions = {
      eventName: 'click',
      jQuery: false,
      onOpen: (menu) => {
        this._applyContextMenuTheme(theme);
        if (contextMenuOptions.onOpen) {
          contextMenuOptions.onOpen(menu);
        }
      },
      onClose: () => {
        this._removeContextMenuTheme();
        if (contextMenuOptions.onClose) {
          contextMenuOptions.onClose();
        }
      },
      fixed: true,
    };

    const mergedOptions = foundry.utils.mergeObject(
      defaultOptions,
      contextMenuOptions
    );

    return new foundry.applications.ux.ContextMenu.implementation(
      this.element,
      selector,
      menuOptions,
      mergedOptions
    );
  }

  /**
   * Setup context menus for all item control toggles
   * @private
   */
  _setupItemContextMenus() {
    // Safety check: ensure element exists and is attached to DOM
    if (!this.element || !this.element.isConnected) {
      return;
    }

    // Check if we have any context menu toggles
    const toggles = this.element.querySelectorAll('.context-menu-toggle');

    if (toggles.length === 0) {
      return;
    }

    // Store reference to this for callbacks
    const sheet = this;

    // Add click listeners to capture which toggle was clicked before the context menu opens
    toggles.forEach((toggle) => {
      toggle.addEventListener('click', () => {
        // Store the clicked toggle for the context menu
        sheet._lastClickedToggle = toggle;

        // Find and store the item ID
        const itemElement = toggle.closest('[data-item-id]');
        if (itemElement) {
          sheet._lastClickedItemId = itemElement.dataset.itemId;
        } else {
          sheet._lastClickedItemId = null;
        }
      });
    });

    // Simple menu options with no-parameter callbacks like the working sort menu
    const menuOptions = [
      {
        name: 'Toggle Favorite',
        icon: '<i class="fas fa-star"></i>',
        callback: function () {
          try {
            if (sheet._lastClickedToggle) {
              const itemElement =
                sheet._lastClickedToggle.closest('[data-item-id]');
              if (itemElement) {
                const itemId = itemElement.dataset.itemId;
                const item = sheet.actor.items.get(itemId);
                if (item) {
                  sheet._toggleItemFavorite(item);
                }
              }
            }
          } catch (error) {
            console.error('Error in favorite callback:', error);
          }
        },
      },
      {
        name: 'Copy Item',
        icon: '<i class="fas fa-copy"></i>',
        callback: function () {
          try {
            if (sheet._lastClickedToggle) {
              const itemElement =
                sheet._lastClickedToggle.closest('[data-item-id]');
              if (itemElement) {
                const itemId = itemElement.dataset.itemId;
                const item = sheet.actor.items.get(itemId);
                if (item && sheet.isEditable && sheet._isEditMode()) {
                  sheet._copyItem(item);
                }
              }
            }
          } catch (error) {
            console.error('Error in copy callback:', error);
          }
        },
      },
      {
        name: 'Delete Item',
        icon: '<i class="fas fa-trash"></i>',
        className: 'destructive',
        callback: function () {
          try {
            if (sheet._lastClickedToggle) {
              const itemElement =
                sheet._lastClickedToggle.closest('[data-item-id]');
              if (itemElement) {
                const itemId = itemElement.dataset.itemId;
                const item = sheet.actor.items.get(itemId);
                if (item && sheet.isEditable && sheet._isEditMode()) {
                  sheet._deleteItem(item);
                }
              }
            }
          } catch (error) {
            console.error('Error in delete callback:', error);
          }
        },
      },
    ];

    // Allow modules to add custom options via hook
    // Hook signature: (menuOptions, sheet, actor)
    const customMenuOptions = [];
    Hooks.callAll(
      'getItemContextMenuOptions',
      customMenuOptions,
      this,
      this.actor
    );

    // Store custom options separately - we'll add them dynamically in onOpen callback
    // This prevents Foundry's ContextMenu from pre-sizing the menu for items that might be
    // conditionally hidden, avoiding empty space in the menu
    const customOptions = customMenuOptions.map((opt) => ({
      name: opt.name,
      icon: opt.icon,
      className: opt.className,
      condition: opt.condition,
      callback: opt.callback,
    }));

    // Clean up existing context menu if it exists
    if (this._itemContextMenu) {
      try {
        // Only try to close if the context menu's element still exists and is connected
        if (this._itemContextMenu.element?.isConnected) {
          this._itemContextMenu.close();
        }
      } catch (e) {
        // Silently ignore errors during cleanup
      }
      this._itemContextMenu = null;
    }

    // Initialize Foundry ContextMenu for all context menu toggles
    try {
      this._itemContextMenu =
        new foundry.applications.ux.ContextMenu.implementation(
          this.element,
          '.context-menu-toggle',
          menuOptions,
          {
            eventName: 'click',
            jQuery: false,
            onOpen: () => {
              // Use the stored values from the click listener
              const currentItemId = sheet._lastClickedItemId;

              // Wait for menu DOM to be available, then add attributes and event listeners
              // Use requestAnimationFrame for better timing
              requestAnimationFrame(() => {
                try {
                  // Try to find the menu element in the DOM
                  const contextMenu = document.querySelector('#context-menu');
                  if (!contextMenu) {
                    return;
                  }

                  // Add data-action attributes and event listeners to built-in menu items
                  const menuItems =
                    contextMenu.querySelectorAll('.context-item');

                  const actions = ['toggleFavorite', 'copyDoc', 'deleteDoc'];

                  menuItems.forEach((item, index) => {
                    // Add data-action attribute based on menu option index
                    item.setAttribute('data-action', actions[index]);

                    // Add item ID reference
                    if (currentItemId) {
                      item.setAttribute('data-item-id', currentItemId);

                      // Update favorite icon based on current item state
                      if (actions[index] === 'toggleFavorite') {
                        const targetItem = sheet.actor.items.get(currentItemId);
                        if (targetItem) {
                          const iconElement = item.querySelector('i');
                          if (iconElement) {
                            // Use solid star if favorited, outline star if not
                            iconElement.className = targetItem.system.favorite
                              ? 'fas fa-star fa-fw'
                              : 'fal fa-star fa-fw';
                          }
                          // Add favorited class to the menu item for special styling
                          item.classList.toggle(
                            'favorited',
                            targetItem.system.favorite
                          );
                        }
                      }
                    }

                    // Add click event listener with capture and once
                    item.addEventListener(
                      'click',
                      (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        event.stopImmediatePropagation();

                        const action = item.getAttribute('data-action');
                        const itemId = item.getAttribute('data-item-id');

                        const targetItem = itemId
                          ? sheet.actor.items.get(itemId)
                          : null;

                        if (!targetItem) {
                          ui.notifications.warn('Item not found');
                          return;
                        }

                        switch (action) {
                          case 'toggleFavorite':
                            sheet._toggleItemFavorite(targetItem);
                            break;
                          case 'copyDoc':
                            // Context menu copy works outside edit mode
                            if (sheet.isEditable) {
                              sheet._copyItem(targetItem);
                            } else {
                              ui.notifications.warn(
                                'You do not have permission to copy items'
                              );
                            }
                            break;
                          case 'deleteDoc':
                            // Context menu delete works outside edit mode (with confirmation)
                            if (sheet.isEditable) {
                              sheet._deleteItem(targetItem);
                            } else {
                              ui.notifications.warn(
                                'You do not have permission to delete items'
                              );
                            }
                            break;
                        }

                        // Close the context menu after action
                        if (contextMenu) {
                          contextMenu.remove();
                        }
                      },
                      { capture: true }
                    );
                  });

                  // Dynamically add custom menu items from hooks
                  // Items are only created if their condition passes, preventing empty space
                  customOptions.forEach((customOpt, customIndex) => {
                    // Evaluate condition - skip if it returns false
                    if (customOpt.condition) {
                      try {
                        const shouldShow = customOpt.condition(currentItemId);
                        if (!shouldShow) return;
                      } catch (error) {
                        console.error(
                          'Error evaluating custom menu condition:',
                          error
                        );
                        return;
                      }
                    }

                    // Create the menu item element
                    const li = document.createElement('li');
                    li.className = 'context-item';
                    if (customOpt.className) {
                      li.classList.add(customOpt.className);
                    }
                    li.setAttribute('data-action', `custom-${customIndex}`);
                    if (currentItemId) {
                      li.setAttribute('data-item-id', currentItemId);
                    }

                    li.innerHTML = `${customOpt.icon}<span>${customOpt.name}</span>`;

                    // Add click handler for custom action
                    li.addEventListener(
                      'click',
                      (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        event.stopImmediatePropagation();

                        const itemId = li.getAttribute('data-item-id');
                        const targetItem = itemId
                          ? sheet.actor.items.get(itemId)
                          : null;

                        if (customOpt.callback) {
                          customOpt.callback(itemId, targetItem);
                        }

                        if (contextMenu) {
                          contextMenu.remove();
                        }
                      },
                      { capture: true }
                    );

                    // Append to menu
                    const menuElement =
                      contextMenu.querySelector('menu.context-items');
                    if (menuElement) {
                      menuElement.appendChild(li);
                    }
                  });
                } catch (error) {
                  console.error('Error setting up context menu items:', error);
                }
              });

              // Add active state to clicked toggle
              if (sheet._lastClickedToggle) {
                sheet._lastClickedToggle.classList.add('active');
              }

              // Apply standardized theming
              setTimeout(() => {
                this._applyContextMenuTheme('standard');
              }, 1);
            },
            onClose: () => {
              // Remove active state from clicked toggle
              if (sheet._lastClickedToggle) {
                sheet._lastClickedToggle.classList.remove('active');
              }

              // Clear the current clicked toggle reference
              sheet._lastClickedToggle = null;

              // Remove context menu theming
              this._removeContextMenuTheme();
            },
            fixed: true,
          }
        );
    } catch (error) {
      console.error('Error creating context menu:', error);
    }
  }

  /**
   * Toggle item favorite status
   * @param {Item} item The item to toggle
   * @private
   */
  async _toggleItemFavorite(item) {
    await item.update({
      'system.favorite': !item.system.favorite,
    });
  }

  /**
   * Copy an item
   * @param {Item} item The item to copy
   * @private
   */
  async _copyItem(item) {
    await item.clone({}, { save: true });
    ui.notifications.info(
      game.i18n.format('DOCUMENT.Copied', {
        type: item.type,
        name: item.name,
      })
    );
  }

  /**
   * Delete an item with confirmation using DialogV2.confirm
   * @param {Item} item The item to delete
   * @private
   */
  async _deleteItem(item) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: game.i18n.format('DOCUMENT.Delete', { type: item.type }),
        icon: 'fas fa-trash',
      },
      content: `<p>${game.i18n.format('DOCUMENT.DeleteWarning', {
        type: item.type,
        name: item.name,
      })}</p>`,
      modal: true,
      rejectClose: false,
    });

    if (confirmed) {
      try {
        await item.delete();
        ui.notifications.info(
          game.i18n.format('DOCUMENT.Deleted', {
            type: item.type,
            name: item.name,
          })
        );
      } catch (error) {
        console.error('Error deleting item:', error);
        ui.notifications.error(game.i18n.localize('DOCUMENT.DeleteFailure'));
      }
    }
  }

  /**
   * Delete an item without confirmation (for Edit Mode)
   * @param {Item} item The item to delete
   * @private
   */
  async _deleteItemNoConfirm(item) {
    try {
      await item.delete();
      ui.notifications.info(
        game.i18n.format('DOCUMENT.Deleted', {
          type: item.type,
          name: item.name,
        })
      );
    } catch (error) {
      console.error('Error deleting item:', error);
      ui.notifications.error(game.i18n.localize('DOCUMENT.DeleteFailure'));
    }
  }
}
