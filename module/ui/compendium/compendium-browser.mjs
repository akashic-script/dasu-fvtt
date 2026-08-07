import { CompendiumIndex } from './compendium-index.mjs';
import { CompendiumFilter } from './compendium-filter.mjs';
import {
  DaemonCompendiumRenderer,
  ItemsCompendiumRenderer,
  TagCompendiumRenderer,
  EffectCompendiumRenderer,
} from './compendium-table-renderers.mjs';
import { DASU } from '../../helpers/config.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const T = (name) => `systems/dasu/templates/ui/compendium-browser/${name}.hbs`;

// Item subtypes shown in the merged "Items" tab. Tags get their own tab; bond
// and dejection are actor-relational, not generic content, so excluded.
const ITEM_TAB_TYPES = [
  'archetype',
  'subtype',
  'item',
  'feature',
  'class',
  'ability',
  'weapon',
  'tactic',
  'schema',
  'specialAbility',
  'skillAbility',
  'scar',
];

/**
 * Read-only browser over dasu's compendium content, grouped into tabs.
 * Launch via `game.dasu.openCompendiumBrowser()` or the Compendium sidebar button.
 * @typedef {"daemons"|"items"|"tags"|"effects"} CompendiumBrowserTab
 */
export class CompendiumBrowser extends HandlebarsApplicationMixin(
  ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    id: 'dasu-compendium-browser',
    classes: ['dasu', 'dasu-compendium-browser'],
    position: { width: 880, height: 720 },
    window: {
      title: 'DASU.CompendiumBrowser.Title',
      icon: 'fas fa-book-open',
      resizable: true,
      controls: [
        {
          action: 'refreshIndex',
          icon: 'fas fa-arrows-rotate',
          label: 'DASU.CompendiumBrowser.Refresh',
        },
      ],
    },
    actions: {
      refreshIndex: CompendiumBrowser.#onRefreshIndex,
    },
  };

  static TABS = {
    primary: {
      tabs: [
        {
          id: 'daemons',
          label: 'DASU.CompendiumBrowser.Tab.Daemons',
          icon: 'fas fa-dragon',
        },
        {
          id: 'items',
          label: 'DASU.CompendiumBrowser.Tab.Items',
          icon: 'fas fa-suitcase',
        },
        {
          id: 'tags',
          label: 'DASU.CompendiumBrowser.Tab.Tags',
          icon: 'fas fa-tag',
        },
        {
          id: 'effects',
          label: 'DASU.CompendiumBrowser.Tab.Effects',
          icon: 'fas fa-bolt',
        },
      ],
      initial: 'daemons',
    },
  };

  static PARTS = {
    tabs: { template: 'systems/dasu/templates/actor/parts/tab-navigation.hbs' },
    sidebar: { template: T('sidebar') },
    daemons: { template: T('content-tab') },
    items: { template: T('content-tab') },
    tags: { template: T('content-tab') },
    effects: { template: T('content-tab') },
  };

  /** @type {CompendiumBrowser} */
  static #instance;

  /** @returns {CompendiumBrowser} */
  static get instance() {
    return (CompendiumBrowser.#instance ??= new CompendiumBrowser());
  }

  #filter = new CompendiumFilter();

  #renderers = {
    daemons: new DaemonCompendiumRenderer({ id: 'compendium-daemons' }),
    items: new ItemsCompendiumRenderer({ id: 'compendium-items' }),
    tags: new TagCompendiumRenderer({ id: 'compendium-tags' }),
    effects: new EffectCompendiumRenderer({ id: 'compendium-effects' }),
  };

  #listenersBound = false;

  /** Ids of collapsed filter groups, so re-renders keep them folded. */
  #collapsedGroups = new Set();

  /** Active tab's loaded entries, stashed in `_prepareContext` for reuse. */
  #activeEntries = [];

  /** null column = default name-ascending; cycles asc -> desc -> null. @type {{ column: string|null, dir: 'asc'|'desc' }} */
  #sort = { column: null, dir: 'asc' };

  /** Per-render facet cache; see {@link #facetEntries}. @type {Map<string, object[]>} */
  #facetCache = new Map();

  /** Per-tab data loader + category/range builders. */
  #tabDefs = {
    daemons: {
      load: async (idx) => {
        const daemons = await idx.getActorsOfType('daemon');
        for (const daemon of daemons) this.#decorateDaemon(daemon);
        return daemons;
      },
      categories: (entries) => ({
        ...this.#nameCategory('archetype', entries, {
          label: 'DASU.CompendiumBrowser.Archetype',
          propertyPath: '_filter.archetype',
        }),
        ...this.#nameCategory('subtype', entries, {
          label: 'DASU.CompendiumBrowser.Subtype',
          propertyPath: '_filter.subtype',
        }),
        roles: {
          label: 'DASU.Daemon.Roles',
          propertyPath: 'system.roles',
          options: Object.entries(DASU.daemonRoles).map(([value, label]) => ({
            value,
            label: game.i18n.localize(label),
          })),
        },
        ...this.#featureCategory(entries),
        ...this.#sourceCategory(entries),
      }),
      ranges: () => ({
        level: {
          label: 'DASU.Level',
          propertyPath: 'system.level',
          defaultMin: 0,
          defaultMax: 30,
        },
      }),
    },
    items: {
      load: async (idx) => {
        const groups = await idx.getItems();
        return ITEM_TAB_TYPES.flatMap((type) => groups[type] ?? []);
      },
      categories: (entries) => ({
        type: {
          label: 'DASU.CompendiumBrowser.Type',
          propertyPath: 'type',
          options: ITEM_TAB_TYPES.filter((type) =>
            this.#facetEntries(entries, 'type').some((e) => e.type === type)
          ).map((type) => ({
            value: type,
            label: game.i18n.localize(`TYPES.Item.${type}`),
          })),
        },
        ...this.#subtypeCategory(entries, 'abilityCategory', {
          type: 'ability',
          label: 'DASU.CompendiumBrowser.AbilitySubtype',
          subtypes: DASU.abilityCategories,
        }),
        ...this.#subtypeCategory(entries, 'itemCategory', {
          type: 'item',
          label: 'DASU.CompendiumBrowser.ItemSubtype',
          subtypes: DASU.itemCategories,
        }),
        ...this.#sourceCategory(entries),
      }),
    },
    tags: {
      load: (idx) => idx.getItemsOfType('tag'),
      categories: (entries) => ({
        applicableTypes: {
          label: 'DASU.Tag.Types',
          propertyPath: 'system.applicableTypes',
          options: this.#collectOptions(
            entries,
            'system.applicableTypes',
            (t) => game.i18n.localize(`TYPES.Item.${t}`) || t
          ),
        },
        ...this.#sourceCategory(entries),
      }),
    },
    effects: {
      load: async (idx) => {
        const effects = await idx.getEffects();
        for (const effect of effects) this.#decorateEffect(effect);
        return effects;
      },
      categories: (entries) => ({
        ...this.#booleanCategory('transfer', entries, {
          label: 'DASU.CompendiumBrowser.Passive',
          propertyPath: '_filter.transfer',
        }),
        ...this.#booleanCategory('stackable', entries, {
          label: 'DASU.CompendiumBrowser.Stackable',
          propertyPath: '_filter.stackable',
        }),
        ...this.#sourceCategory(entries),
      }),
    },
  };

  /** @returns {CompendiumBrowserTab} */
  get activeTab() {
    return this.tabGroups.primary ?? this.constructor.TABS.primary.initial;
  }

  /** Source (pack) filter; hidden when the tab spans a single compendium. */
  #sourceCategory(entries) {
    const allSources = CompendiumIndex.instance.getSourceInfo(entries);
    if (allSources.length <= 1) return {};
    const options = CompendiumIndex.instance
      .getSourceInfo(this.#facetEntries(entries, 'source'))
      .map((s) => ({ value: s.id, label: s.label }));
    return {
      source: {
        label: 'DASU.CompendiumBrowser.Source',
        propertyPath: '_pack',
        options,
      },
    };
  }

  /** Type-scoped subtype filter for the merged Items tab; hidden until an entry of `type` is present. */
  #subtypeCategory(entries, id, { type, label, subtypes }) {
    if (!entries.some((e) => e.type === type)) return {};
    const present = new Set(
      this.#facetEntries(entries, id)
        .filter((e) => e.type === type)
        .map((e) => e.system?.category)
    );
    const options = Object.entries(subtypes)
      .filter(([value]) => present.has(value))
      .map(([value, key]) => ({ value, label: game.i18n.localize(key) }));
    if (!options.length) return {};
    return {
      [id]: {
        label,
        propertyPath: 'system.category',
        matchTypes: new Set([type]),
        parentType: type, // see #syncTypeSubtype
        options,
      },
    };
  }

  /** Non-enumerable `_filter` bag derived from the daemon's embedded items (unreachable via `system.*`). */
  #decorateDaemon(daemon) {
    if (daemon._filter) return;
    const itemTypes = daemon.itemTypes ?? {};
    const features = [];
    if (itemTypes.specialAbility?.length) features.push('specialAbility');
    if (daemon.system?.transformations?.length)
      features.push('transformations');
    const value = {
      archetype: itemTypes.archetype?.[0]?.name,
      subtype: itemTypes.subtype?.[0]?.name,
      features,
    };
    Object.defineProperty(daemon, '_filter', { value, configurable: true });
  }

  /** `_filter` bag for the Passive/Stackable filters. */
  #decorateEffect(effect) {
    if (effect._filter) return;
    effect._filter = {
      transfer: effect.transfer ? 'yes' : undefined,
      stackable: effect.flags?.dasu?.stacks != null ? 'yes' : undefined,
    };
  }

  /** Faceted category of the distinct values at `propertyPath`; hidden when none. */
  #nameCategory(id, entries, { label, propertyPath }) {
    const options = this.#collectOptions(
      this.#facetEntries(entries, id),
      propertyPath,
      (name) => name
    );
    if (!options.length) return {};
    return { [id]: { label, propertyPath, options } };
  }

  /**
   * One "Has" group holding a checkbox per boolean daemon feature, instead of a
   * separate single-checkbox group each. Checking several is OR (has any). Only
   * features present in the current facet are offered.
   */
  #featureCategory(entries) {
    const features = [
      {
        value: 'specialAbility',
        key: 'DASU.CompendiumBrowser.HasSpecialAbility',
      },
      {
        value: 'transformations',
        key: 'DASU.CompendiumBrowser.HasTransformations',
      },
    ];
    const present = new Set(
      this.#facetEntries(entries, 'features').flatMap(
        (e) => e._filter?.features ?? []
      )
    );
    const options = features
      .filter((f) => present.has(f.value))
      .map((f) => ({ value: f.value, label: game.i18n.localize(f.key) }));
    if (!options.length) return {};
    return {
      features: {
        label: 'DASU.CompendiumBrowser.Has',
        propertyPath: '_filter.features',
        options,
      },
    };
  }

  /** Single-checkbox filter matching entries whose `propertyPath` is `'yes'`. */
  #booleanCategory(id, entries, { label, propertyPath }) {
    const anyYes = entries.some(
      (e) => foundry.utils.getProperty(e, propertyPath) === 'yes'
    );
    if (!anyYes) return {};
    return {
      [id]: {
        label,
        propertyPath,
        options: [
          {
            value: 'yes',
            label: game.i18n.localize('DASU.CompendiumBrowser.Yes'),
          },
        ],
      },
    };
  }

  /**
   * Keep the Items `type` filter and its subtype categories in sync: checking a
   * subtype selects its parent type; unchecking a type clears its subtypes.
   */
  #syncTypeSubtype(category, option, checked) {
    const parentType = this.#filter.categories[category]?.parentType;
    if (parentType) {
      if (checked) this.#filter.toggle('type', parentType, true);
      return;
    }

    if (category !== 'type' || checked) return;
    for (const [id, def] of Object.entries(this.#filter.categories)) {
      if (def.parentType !== option || !def.selected?.size) continue;
      for (const value of [...def.selected])
        this.#filter.toggle(id, value, false);
    }
  }

  #resetFacetCache() {
    this.#facetCache.clear();
  }

  /** Entries matching every *other* active filter, to facet one category's options. Memoized per render. */
  #facetEntries(entries, excludeCategoryId) {
    const key = this.#filter.hasSelection(excludeCategoryId)
      ? excludeCategoryId
      : '';
    let cached = this.#facetCache.get(key);
    if (!cached) {
      cached = entries.filter((e) =>
        this.#filter.isVisibleExcluding(e, key || null)
      );
      this.#facetCache.set(key, cached);
    }
    return cached;
  }

  /** Distinct sorted checkbox options from an array-or-scalar field. */
  #collectOptions(entries, propertyPath, localize) {
    const values = new Set();
    for (const entry of entries) {
      const raw = foundry.utils.getProperty(entry, propertyPath);
      for (const value of Array.isArray(raw) ? raw : [raw]) {
        if (value != null && value !== '' && value !== 'all') values.add(value);
      }
    }
    return [...values]
      .map((value) => ({ value, label: localize(value) }))
      .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
  }

  /** @override render only nav, sidebar, and the active content part. */
  _configureRenderOptions(options) {
    const requestedParts = options.parts;
    super._configureRenderOptions(options);
    if (!requestedParts) {
      options.parts = ['tabs', 'sidebar', this.activeTab];
    }
  }

  /** @override load and sort entries, and rebuild sidebar filter facets when it renders. */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const def = this.#tabDefs[this.activeTab];
    this.#activeEntries = await def.load(CompendiumIndex.instance);
    this.#sortEntries();
    // Content-only passes (search, sort) reuse existing categories/selections.
    if (options.parts?.includes('sidebar')) {
      this.#resetFacetCache();
      this.#filter.setCategories(def.categories(this.#activeEntries));
      this.#filter.setRanges(def.ranges?.(this.#activeEntries) ?? {});
    }
    return context;
  }

  /** @returns {Record<string, (entry: object) => string|number>} */
  #sortKeys() {
    return this.#renderers[this.activeTab].constructor.SORT_KEYS ?? {};
  }

  /** Order {@link #activeEntries} in place by the active sort column, falling back to name-ascending. */
  #sortEntries() {
    const keys = this.#sortKeys();
    const lang = game.i18n.lang;
    const byName = (a, b) => (a.name ?? '').localeCompare(b.name ?? '', lang);

    const getKey = this.#sort.column && keys[this.#sort.column];
    if (!getKey) {
      this.#activeEntries.sort(byName);
      return;
    }

    const sign = this.#sort.dir === 'desc' ? -1 : 1;
    this.#activeEntries.sort((a, b) => {
      const av = getKey(a);
      const bv = getKey(b);
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : `${av}`.localeCompare(`${bv}`, lang);
      return cmp ? sign * cmp : byName(a, b);
    });
  }

  /** Cycle a column's sort: asc -> desc -> off (default name order). */
  #cycleSort(column) {
    if (this.#sort.column !== column) this.#sort = { column, dir: 'asc' };
    else if (this.#sort.dir === 'asc') this.#sort.dir = 'desc';
    else this.#sort = { column: null, dir: 'asc' };
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);

    // context.tabs is shared across parts; give the nav a copy, not a mutation.
    if (partId === 'tabs') {
      return { ...context, tabs: Object.values(context.tabs ?? {}) };
    }

    const tab = context.tabs?.[partId];
    if (tab) context.tab = tab;

    if (partId in this.#tabDefs) {
      await this.#prepareTab(partId, context);
    } else if (partId === 'sidebar') {
      this.#prepareSidebar(context);
    }
    return context;
  }

  async #prepareTab(tabId, context) {
    const entries = this.#activeEntries;
    context.empty = entries.length === 0;
    context.tables = [
      await this.#renderers[tabId].renderTable(entries, {
        isVisible: this.#filter.isVisible,
        hideIfEmpty: false,
      }),
    ];
  }

  #prepareSidebar(context) {
    context.search = this.#filter.text;
    context.categories = Object.entries(this.#filter.categories).map(
      ([id, category]) => ({
        id,
        label: category.label,
        collapsed: this.#collapsedGroups.has(id),
        options: category.options.map((option) => ({
          ...option,
          checked: category.selected?.has(option.value) ?? false,
        })),
      })
    );
    context.ranges = Object.entries(this.#filter.ranges).map(([id, range]) => ({
      id,
      label: range.label,
      collapsed: this.#collapsedGroups.has(id),
      min: range.min ?? '',
      max: range.max ?? '',
    }));
  }

  /** @override */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    for (const renderer of Object.values(this.#renderers)) {
      renderer.activateListeners(this);
    }
    this.#bindFilterListeners();
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this.#decorateHeaders();
  }

  /** Mark the active tab's sortable header cells and show the current sort direction. */
  #decorateHeaders() {
    const keys = this.#sortKeys();
    const table = this.element.querySelector(
      `.tab[data-tab="${this.activeTab}"] .dasu-table`
    );
    if (!table) return;
    for (const header of table.querySelectorAll(
      '.dasu-table__header-cell[data-column]'
    )) {
      const column = header.dataset.column;
      if (!keys[column]) continue;
      header.dataset.sortable = '';
      const active = this.#sort.column === column;
      if (active) header.dataset.sortDir = this.#sort.dir;
      else delete header.dataset.sortDir;
    }
  }

  /** Delegated filter listeners on the root element (survive part re-renders). */
  #bindFilterListeners() {
    if (this.#listenersBound) return;
    this.#listenersBound = true;

    const rerenderContent = foundry.utils.debounce(
      () => this.render({ parts: [this.activeTab] }),
      150
    );

    this.element.addEventListener('input', (event) => {
      const search = event.target.closest('[data-filter-search]');
      if (search) {
        this.#filter.setText(search.value);
        rerenderContent();
        return;
      }

      const range = event.target.closest('[data-range]');
      if (!range) return;
      const { range: id, bound } = range.dataset;
      const value = range.value.trim() === '' ? null : Number(range.value);
      this.#filter.setRangeBound(id, bound, Number.isNaN(value) ? null : value);
      rerenderContent();
    });

    this.element.addEventListener('change', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== 'checkbox')
        return;
      const { category, option } = input.dataset;
      if (!category || !option) return;
      this.#filter.toggle(category, option, input.checked);
      this.#syncTypeSubtype(category, option, input.checked);
      this.render({ parts: ['sidebar', this.activeTab] });
    });

    this.element.addEventListener('click', (event) => {
      const header = event.target.closest(
        '.dasu-table__header-cell[data-sortable]'
      );
      if (!header) return;
      this.#cycleSort(header.dataset.column);
      this.render({ parts: [this.activeTab] });
    });

    // <details> toggle doesn't bubble, so listen in the capture phase. No
    // re-render needed; the element already reflects it, we just persist it.
    this.element.addEventListener(
      'toggle',
      (event) => {
        const group = event.target;
        if (!(group instanceof HTMLDetailsElement) || !group.dataset.group)
          return;
        if (group.open) this.#collapsedGroups.delete(group.dataset.group);
        else this.#collapsedGroups.add(group.dataset.group);
      },
      true
    );
  }

  /** @override reset filter + sort and re-render sidebar + content on tab switch. */
  changeTab(tab, group, options) {
    super.changeTab(tab, group, options);
    if (group !== 'primary') return;
    this.#filter.clear();
    this.#sort = { column: null, dir: 'asc' };
    this.render({ parts: ['sidebar', tab] });
  }

  /** @override */
  async _onClose(options) {
    this.#filter.clear();
    this.#sort = { column: null, dir: 'asc' };
    return super._onClose(options);
  }

  /** @this {CompendiumBrowser} */
  static async #onRefreshIndex() {
    CompendiumIndex.reinitialize();
    this.#filter.clear();
    this.#sort = { column: null, dir: 'asc' };
    ui.notifications.info(
      game.i18n.localize('DASU.CompendiumBrowser.Refreshed')
    );
    this.render(true);
  }

  /** Add the launch button to the Compendium sidebar; wire up the index. */
  static initialize() {
    CompendiumIndex.initialize();
    Hooks.on('renderCompendiumDirectory', (app, html) => {
      const root = html instanceof HTMLElement ? html : html?.[0];
      if (!root || root.querySelector('.dasu-compendium-browser-launch'))
        return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dasu-compendium-browser-launch';
      button.innerHTML = `<i class="fas fa-book-open" inert></i><span>${game.i18n.localize(
        'DASU.CompendiumBrowser.Title'
      )}</span>`;
      button.addEventListener('click', () =>
        CompendiumBrowser.instance.render(true)
      );
      const actionButtons = root.querySelector('.action-buttons');
      if (actionButtons) actionButtons.append(button);
      else (root.querySelector('.directory-header') ?? root).prepend(button);
    });
  }
}
