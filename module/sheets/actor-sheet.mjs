const { HandlebarsApplicationMixin } = foundry.applications.api;
const { DocumentSheetV2 } = foundry.applications.api;
import {
  onManageActiveEffect,
  prepareActiveEffectCategories,
} from '../helpers/effects.mjs';

/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {DocumentSheetV2}
 * @mixes {HandlebarsApplication}
 */
export class DASUActorSheet extends HandlebarsApplicationMixin(
  DocumentSheetV2
) {
  static MODES = { PLAY: 1, EDIT: 2 };

  _mode = null;

  get isEditMode() {
    return this._mode === this.constructor.MODES.EDIT;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ['dasu', 'sheet', 'actor'],
    position: { width: 600, height: 850 },
    window: { resizable: true },
    form: {
      submitOnChange: true,
    },
    actions: {
      editItem: DASUActorSheet.#editItem,
      createItem: DASUActorSheet.#createItem,
      deleteItem: DASUActorSheet.#deleteItem,
      create: DASUActorSheet.#onEffectAction,
      edit: DASUActorSheet.#onEffectAction,
      delete: DASUActorSheet.#onEffectAction,
      toggle: DASUActorSheet.#onEffectAction,
      menu: DASUActorSheet.#onEffectAction,
      roll: DASUActorSheet.#onRoll,
      resourceStep: DASUActorSheet.#onResourceStep,
      openResourcePopover: DASUActorSheet.#onOpenResourcePopover,
    },
  };

  /** @override */
  static TABS = {
    primary: {
      tabs: [
        { id: 'features', label: 'Features', icon: 'fas fa-list' },
        { id: 'description', label: 'Identity', icon: 'fas fa-feather' },
        { id: 'items', label: 'Items', icon: 'fas fa-backpack' },
        { id: 'spells', label: 'Spells', icon: 'fas fa-book-sparkles' },
        { id: 'effects', label: 'Effects', icon: 'fas fa-bolt' },
      ],
      initial: 'features',
    },
  };

  /** @override */
  _prepareTabs(group) {
    const tabs = super._prepareTabs(group);
    if (group === 'primary' && this.actor.type === 'npc') {
      // NPCs don't have features or spells tabs
      delete tabs.features;
      delete tabs.spells;
      // Set description as initial tab for NPCs
      tabs.description.active = true;
      tabs.description.cssClass = 'active';
    }
    return tabs;
  }

  /** @override */
  static PARTS = {
    header: {
      template: 'systems/dasu/templates/actor/parts/header.hbs',
    },
    sidebar: {
      template: 'systems/dasu/templates/actor/parts/sidebar.hbs',
    },
    tabs: {
      template: 'systems/dasu/templates/actor/parts/tab-navigation.hbs',
    },
    features: {
      template: 'systems/dasu/templates/actor/parts/features.hbs',
      scrollable: [''],
    },
    description: {
      template: 'systems/dasu/templates/actor/parts/description.hbs',
      scrollable: [''],
    },
    items: {
      template: 'systems/dasu/templates/actor/parts/items.hbs',
      scrollable: [''],
    },
    spells: {
      template: 'systems/dasu/templates/actor/parts/spells.hbs',
      scrollable: [''],
    },
    effects: {
      template: 'systems/dasu/templates/actor/parts/effects.hbs',
      scrollable: [''],
    },
  };

  /** @override */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    this._mode = options.mode ?? this._mode ?? this.constructor.MODES.PLAY;
  }

  /** @override */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    const actorType = this.actor.type;

    if (actorType === 'npc') {
      parts.header.template = `systems/dasu/templates/actor/parts/header-npc.hbs`;
      parts.sidebar.template = `systems/dasu/templates/actor/parts/sidebar-npc.hbs`;
      delete parts.features;
      delete parts.spells;
    }

    return parts;
  }

  /**
   * The Actor document managed by this sheet.
   * @type {Actor}
   */
  get actor() {
    return this.document;
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
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = context.document;
    const actorData = actor.system;

    // Add the actor's data to context for easier access, as well as flags.
    context.actor = actor;
    context.data = actor.toObject(); // Legacy compatibility
    context.system = actorData;
    context.flags = actor.flags;

    // Template convenience variables
    context.cssClass = [...this.options.classes, actor.type].join(' ');
    context.owner = actor.isOwner;

    // Add items array for compatibility with legacy getData() structure
    context.items = Array.from(actor.items.values());
    context.items.sort((a, b) => (a.sort || 0) - (b.sort || 0));

    // Prepare character data and items.
    if (actor.type === 'character') {
      this._prepareItems(context);
      this._prepareCharacterData(context);
    }

    // Prepare NPC data and items.
    if (actor.type === 'npc') {
      this._prepareItems(context);
    }

    // Add roll data for TinyMCE editors.
    context.rollData = actor.getRollData();

    context.biographyHTML =
      await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        actor.system.biography ?? '',
        {
          relativeTo: actor,
          secrets: actor.isOwner,
          rollData: context.rollData,
        }
      );

    // Resource bar percentages for sidebar
    const health = actorData.health ?? {};
    const power = actorData.power ?? {};
    context.healthPercent =
      health.max > 0
        ? Math.min(100, Math.max(0, (health.value / health.max) * 100))
        : 0;
    context.powerPercent =
      power.max > 0
        ? Math.min(100, Math.max(0, (power.value / power.max) * 100))
        : 0;

    // Prepare active effects
    context.effects = prepareActiveEffectCategories(
      // A generator that returns all effects stored on the actor
      // as well as any items
      actor.allApplicableEffects()
    );

    return context;
  }

  /**
   * Organize and classify Items for Character sheets.
   *
   * @param {Object} context The context to prepare.
   *
   * @return {undefined}
   */
  _prepareCharacterData(context) {
    // Ability labels and modifiers are prepared by the TypeDataModel.
  }

  /**
   * Organize and classify Items for Character sheets.
   *
   * @param {Object} context The context to prepare.
   *
   * @return {undefined}
   */
  _prepareItems(context) {
    // Initialize containers.
    const gear = [];
    const features = [];
    const spells = {
      0: [],
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
      7: [],
      8: [],
      9: [],
    };

    // Iterate through items, allocating to containers
    for (let i of context.items) {
      i.img = i.img || Item.DEFAULT_ICON;
      // Append to gear.
      if (i.type === 'item') {
        gear.push(i);
      }
      // Append to features.
      else if (i.type === 'feature') {
        features.push(i);
      }
      // Append to spells.
      else if (i.type === 'spell') {
        if (i.system.spellLevel != undefined) {
          spells[i.system.spellLevel].push(i);
        }
      }
    }

    // Assign and return
    context.gear = gear;
    context.features = features;
    context.spells = spells;
  }

  /* -------------------------------------------- */

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    if (this.actor.type === 'npc') {
      this.tabGroups.primary ??= 'description';
    }
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

  _renderModeToggle() {
    const header = this.element.querySelector('.window-header');
    if (!header) return;
    let toggle = header.querySelector('.dasu-mode-toggle');
    if (this.isEditable && !toggle) {
      toggle = document.createElement('label');
      toggle.className = 'dasu-mode-toggle';
      toggle.title = 'Toggle edit mode';
      toggle.innerHTML = `
        <input class="dasu-mode-checkbox" type="checkbox" />
        <span class="dasu-mode-track">
          <span class="dasu-mode-thumb"><i class="fas fa-pen"></i></span>
        </span>`;
      toggle
        .querySelector('.dasu-mode-checkbox')
        .addEventListener('change', (e) => {
          const { MODES } = this.constructor;
          this._mode = e.target.checked ? MODES.EDIT : MODES.PLAY;
          this.element.classList.toggle('edit-mode', this.isEditMode);
          this.element
            .querySelectorAll(
              'input:not([type="hidden"]):not(.dasu-mode-checkbox), select'
            )
            .forEach((el) => el.toggleAttribute('readonly', !this.isEditMode));
        });
      toggle.addEventListener('dblclick', (e) => e.stopPropagation());
      toggle.addEventListener('pointerdown', (e) => e.stopPropagation());
      header.prepend(toggle);
    } else if (this.isEditable && toggle) {
      toggle.querySelector('.dasu-mode-checkbox').checked = this.isEditMode;
    } else if (!this.isEditable && toggle) {
      toggle.remove();
    }
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this._renderModeToggle();
    this.element.classList.toggle('edit-mode', this.isEditMode);
    this.element
      .querySelectorAll(
        'input:not([type="hidden"]):not(.dasu-mode-checkbox), select'
      )
      .forEach((el) => el.toggleAttribute('readonly', !this.isEditMode));

    const activeTab =
      this.tabGroups?.primary ??
      (this.actor.type === 'npc'
        ? 'description'
        : this.constructor.TABS.primary.initial);
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

    // Drag events for macros.
    if (this.actor.isOwner) {
      const handler = (ev) => this._onDragStart(ev);
      const itemElements = this.element.querySelectorAll('li.item');
      for (const li of itemElements) {
        if (li.classList.contains('inventory-header')) continue;
        li.setAttribute('draggable', true);
        li.addEventListener('dragstart', handler, false);
      }
    }
  }

  /**
   * Handle editing an item.
   * @param {PointerEvent} event   The originating click event.
   * @param {HTMLElement} target   The capturing HTML element.
   * @private
   */
  static #editItem(event, target) {
    const li = target.closest('.item');
    const item = this.actor.items.get(li.dataset.itemId);
    item.sheet.render(true);
  }

  /**
   * Handle creating a new Owned Item for the actor.
   * @param {PointerEvent} event   The originating click event.
   * @param {HTMLElement} target   The capturing HTML element.
   * @private
   */
  static async #createItem(event, target) {
    event.preventDefault();
    const type = target.dataset.type;
    const data = foundry.utils.deepClone(target.dataset);
    const name = `New ${type.capitalize()}`;
    const itemData = {
      name: name,
      type: type,
      system: data,
    };
    delete itemData.system['type'];
    delete itemData.system['action'];
    return await Item.create(itemData, { parent: this.actor });
  }

  /**
   * Handle deleting an item.
   * @param {PointerEvent} event   The originating click event.
   * @param {HTMLElement} target   The capturing HTML element.
   * @private
   */
  static async #deleteItem(event, target) {
    const li = target.closest('.item');
    const item = this.actor.items.get(li.dataset.itemId);
    await item.delete();
    // Use native DOM to hide the element
    li.style.display = 'none';
    this.render();
  }

  /**
   * Handle active effect management.
   * @param {PointerEvent} event   The originating click event.
   * @param {HTMLElement} target   The capturing HTML element.
   * @private
   */
  static #onEffectAction(event, target) {
    const row = target.closest('li');
    const document =
      row.dataset.parentId === this.actor.id
        ? this.actor
        : this.actor.items.get(row.dataset.parentId);
    onManageActiveEffect(event, document, target);
  }

  /**
   * Handle clickable rolls.
   * @param {PointerEvent} event   The originating click event.
   * @param {HTMLElement} target   The capturing HTML element.
   * @private
   */
  static #onRoll(event, target) {
    if (this.isEditMode) return;
    event.preventDefault();
    const dataset = target.dataset;

    // Handle item rolls.
    if (dataset.rollType) {
      if (dataset.rollType == 'item') {
        const itemId = target.closest('.item').dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (item) return item.roll();
      }
    }

    // Handle rolls that supply the formula directly.
    if (dataset.roll) {
      let label = dataset.label ? `[ability] ${dataset.label}` : '';
      let roll = new Roll(dataset.roll, this.actor.getRollData());
      roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: label,
        rollMode: game.settings.get('core', 'rollMode'),
      });
      return roll;
    }
  }

  /**
   * Handle drag start for macros.
   * @param {DragEvent} event   The drag start event
   * @private
   */
  static async #onOpenResourcePopover(event, target) {
    const { resource } = target.dataset;
    const popId = `dasu-popover-${resource}`;
    const existing = document.getElementById(popId);
    if (existing) {
      existing.remove();
      target.classList.remove('popover-open');
      return;
    }

    const val = this.actor.system[resource === 'health' ? 'health' : 'power'];
    const isHp = resource === 'health';

    const html = await foundry.applications.handlebars.renderTemplate(
      'systems/dasu/templates/actor/parts/resource-popover.hbs',
      {
        value: val.value,
        max: val.max,
        label: isHp ? 'HP' : 'WP',
        labelClass: isHp ? 'resource-label-hp' : 'resource-label-wp',
      }
    );
    const pop = Object.assign(document.createElement('div'), {
      id: popId,
      className: 'dasu-resource-popover',
      innerHTML: html,
    });

    const anchor = this.element;
    const aRect = anchor.getBoundingClientRect();
    const rRect = target.getBoundingClientRect();
    Object.assign(pop.style, {
      top: `${rRect.bottom - aRect.top + anchor.scrollTop + 2}px`,
      left: `${rRect.left - aRect.left + anchor.scrollLeft}px`,
      width: `${rRect.width}px`,
    });
    anchor.appendChild(pop);
    target.classList.add('popover-open');

    const int = (sel) => parseInt(pop.querySelector(sel).value) || 0;

    const syncSidebar = () => {
      const v = int('.pop-value');
      const m = int('.pop-max');
      const row = target;
      const valEl = row.querySelector('.resource-val');
      const maxEl = row.querySelector('.resource-max');
      const fill = row.querySelector('.resource-bar-fill');
      if (valEl) valEl.textContent = v;
      if (maxEl) maxEl.textContent = m;
      if (fill)
        fill.style.width = `${m > 0 ? Math.min(100, (v / m) * 100) : 0}%`;
    };

    const update = (key, v) => {
      this.actor.update(
        { [`system.${resource}.${key}`]: v },
        { render: false }
      );
      syncSidebar();
    };

    pop.querySelectorAll('.resource-btn').forEach((btn) =>
      btn.addEventListener('click', () => {
        const next = Math.min(
          int('.pop-max'),
          Math.max(
            0,
            int('.pop-value') +
              int('.resource-delta') * parseInt(btn.dataset.step)
          )
        );
        pop.querySelector('.pop-value').value = next;
        update('value', next);
      })
    );
    pop.querySelector('.pop-value').addEventListener('change', (e) => {
      update('value', parseInt(e.target.value) || 0);
    });
    pop.querySelector('.pop-max').addEventListener('change', (e) => {
      update('max', parseInt(e.target.value) || 0);
    });
    pop.querySelectorAll('input').forEach((input) => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        }
      });
    });

    const close = (e) => {
      if (!pop.contains(e.target) && e.target !== target) {
        pop.remove();
        target.classList.remove('popover-open');
        document.removeEventListener('pointerdown', close);
        this.render();
      }
    };
    setTimeout(() => document.addEventListener('pointerdown', close), 0);
  }

  static #onResourceStep(event, target) {
    const resource = target.dataset.resource;
    const sign = parseInt(target.dataset.step);
    const deltaInput = target
      .closest('.resource-stepper')
      .querySelector('.resource-delta');
    const delta = (parseInt(deltaInput?.value) || 1) * sign;
    const current =
      foundry.utils.getProperty(this.actor.system, `${resource}.value`) ?? 0;
    const max =
      foundry.utils.getProperty(this.actor.system, `${resource}.max`) ??
      current;
    const newVal = Math.min(max, Math.max(0, current + delta));
    this.actor.update({ [`system.${resource}.value`]: newVal });
  }

  _onDragStart(event) {
    const target = event.currentTarget;
    if ('link' in event.target.dataset) return;

    let dragData;
    if (target.dataset.itemId) {
      const item = this.actor.items.get(target.dataset.itemId);
      dragData = item.toDragData();
    }

    if (dragData) {
      event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
    }
  }
}
