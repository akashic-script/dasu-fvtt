const { HandlebarsApplicationMixin } = foundry.applications.api;
const { DocumentSheetV2 } = foundry.applications.api;
import {
  onManageActiveEffect,
  prepareActiveEffectCategories,
} from '../helpers/effects.mjs';

/**
 * Extend the basic ItemSheet with some very simple modifications
 * @extends {DocumentSheetV2}
 * @mixes {HandlebarsApplication}
 */
export class DASUItemSheet extends HandlebarsApplicationMixin(DocumentSheetV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ['dasu', 'sheet', 'item'],
    position: { width: 480, height: 520 },
    window: { resizable: true },
    form: {
      submitOnChange: true,
    },
    actions: {
      create: DASUItemSheet.#onEffectAction,
      edit: DASUItemSheet.#onEffectAction,
      delete: DASUItemSheet.#onEffectAction,
      toggle: DASUItemSheet.#onEffectAction,
      menu: DASUItemSheet.#onEffectAction,
    },
  };

  /** @override */
  static TABS = {
    primary: {
      tabs: [
        { id: 'description', label: 'Description', icon: 'fas fa-feather' },
        { id: 'attributes', label: 'Attributes', icon: 'fas fa-sliders' },
        { id: 'effects', label: 'Effects', icon: 'fas fa-bolt' },
      ],
      initial: 'description',
    },
  };

  /** @override */
  static PARTS = {
    header: {
      template: 'systems/dasu/templates/item/parts/header.hbs',
    },
    sidebar: {
      template: 'systems/dasu/templates/item/parts/sidebar.hbs',
    },
    tabs: {
      template: 'systems/dasu/templates/item/parts/tab-navigation.hbs',
    },
    description: {
      template: 'systems/dasu/templates/item/parts/description.hbs',
      scrollable: [''],
    },
    attributes: {
      template: 'systems/dasu/templates/item/parts/attributes.hbs',
      scrollable: [''],
    },
    effects: {
      template: 'systems/dasu/templates/item/parts/effects.hbs',
      scrollable: [''],
    },
  };

  /**
   * The Item document managed by this sheet.
   * @type {Item}
   */
  get item() {
    return this.document;
  }

  /** @override */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    // Dynamically set header template based on item type
    const itemType = this.item.type;
    // For now, all item types use the same header, but we could customize per type
    parts.header.template = `systems/dasu/templates/item/parts/header.hbs`;

    // Customize templates based on item type if needed
    // For example, features might not have attributes tab
    // if (itemType === 'feature') {}

    return parts;
  }

  /* -------------------------------------------- */

  /** @override */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (partId === 'tabs' && context.tabs) {
      return { ...context, tabs: Object.values(context.tabs) };
    }
    const tab = context.tabs?.[partId];
    if (tab) context.tab = tab;
    return context;
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.#buildLayout();
  }

  #buildLayout() {
    const sidebar = this.element.querySelector('.sheet-sidebar');
    const tabNav = this.element.querySelector('nav.tabs');
    if (!sidebar || !tabNav) return;

    const tabSections = [
      ...this.element.querySelectorAll('.tab[data-group="primary"]'),
    ];
    const tabBody = document.createElement('div');
    tabBody.classList.add('tab-body');
    tabSections[0]?.before(tabBody);
    tabSections.forEach((s) => tabBody.append(s));
    tabBody.prepend(tabNav);

    const mainContent = document.createElement('div');
    mainContent.classList.add('main-content');
    sidebar.after(mainContent);
    mainContent.append(sidebar, tabBody);

    const sheetBody = document.createElement('div');
    sheetBody.classList.add('sheet-body');
    mainContent.after(sheetBody);
    sheetBody.append(mainContent);
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = context.document;

    // Use a safe clone of the item data for further operations.
    const itemData = item.toObject();

    // Add the item's data to context for easier access, as well as flags.
    context.item = item;
    context.data = itemData; // Legacy compatibility
    context.system = itemData.system;
    context.flags = itemData.flags;

    // Template convenience variables
    context.cssClass = this.options.classes.join(' ');
    context.owner = item.isOwner;

    // Retrieve the roll data for TinyMCE editors.
    context.rollData = item.getRollData();

    context.descriptionHTML =
      await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        item.system.description ?? '',
        { relativeTo: item, secrets: item.isOwner, rollData: context.rollData }
      );

    // Prepare active effects for easier access
    context.effects = prepareActiveEffectCategories(item.effects);

    return context;
  }

  /* -------------------------------------------- */

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);

    const activeTab =
      this.tabGroups?.primary ?? this.constructor.TABS.primary.initial;
    if (
      activeTab &&
      this.element.querySelector(
        `.tab[data-group="primary"][data-tab="${activeTab}"]`
      )
    ) {
      this.changeTab(activeTab, 'primary', {
        force: true,
        updatePosition: false,
      });
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle active effect management.
   * @param {PointerEvent} event   The originating click event.
   * @param {HTMLElement} target   The capturing HTML element.
   * @private
   */
  static #onEffectAction(event, target) {
    onManageActiveEffect(event, this.item, target);
  }
}
