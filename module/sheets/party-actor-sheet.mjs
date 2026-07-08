const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
import { SheetLayoutMixin } from './mixins/sheet-layout-mixin.mjs';
import { ItemTableRenderer } from '../helpers/tables/item-table-renderer.mjs';
import { EffectTableRenderer } from '../helpers/tables/effect-table-renderer.mjs';
import { PartyTableRenderer } from '../helpers/tables/party-table-renderer.mjs';
import { TableFilter } from '../helpers/tables/table-filter.mjs';
import { prepareActiveEffectCategories } from '../helpers/effects.mjs';
import {
  addDaemonToStock,
  moveToPartyStorage,
  claimFromPartyStorage,
  linkDaemonToken,
} from '../helpers/daemon-stock.mjs';

export class DASUPartyActorSheet extends SheetLayoutMixin(
  HandlebarsApplicationMixin(ActorSheetV2)
) {
  #itemTable = new ItemTableRenderer();
  #temporaryEffectsTable = new EffectTableRenderer(
    'temporary',
    'DASU.Effect.Temporary',
    (doc) =>
      prepareActiveEffectCategories(doc.allApplicableEffects()).temporary
        .effects
  );
  #passiveEffectsTable = new EffectTableRenderer(
    'passive',
    'DASU.Effect.Passive',
    (doc) =>
      prepareActiveEffectCategories(doc.allApplicableEffects()).passive.effects
  );
  #inactiveEffectsTable = new EffectTableRenderer(
    'inactive',
    'DASU.Effect.Inactive',
    (doc) =>
      prepareActiveEffectCategories(doc.allApplicableEffects()).inactive.effects
  );

  /** Shared filter state for the Summoners/Roster/Storage tabs, both layouts. */
  #filter = new TableFilter('name');

  /** Card data for the current render, provider-fed to the table renderers. */
  #cardData = { summoners: [], roster: [], storage: [] };

  #summonersTable = new PartyTableRenderer(
    'summoners',
    () => this.#cardData.summoners
  );
  #rosterTable = new PartyTableRenderer('roster', () => this.#cardData.roster);
  #storageTable = new PartyTableRenderer(
    'storage',
    () => this.#cardData.storage
  );

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ['dasu', 'sheet', 'actor', 'party'],
    position: { width: 720, height: 860 },
    window: { resizable: true, icon: 'fas fa-people-group' },
    form: { submitOnChange: true },
    actions: {
      openActor: DASUPartyActorSheet.#onOpenActor,
      removeMember: DASUPartyActorSheet.#onRemoveMember,
      toggleActive: DASUPartyActorSheet.#onToggleActive,
      toggleChanneled: DASUPartyActorSheet.#onToggleChanneled,
      storeDaemon: DASUPartyActorSheet.#onStoreDaemon,
      claimDaemon: DASUPartyActorSheet.#onClaimDaemon,
      removeFromStorage: DASUPartyActorSheet.#onRemoveFromStorage,
      selectMember: DASUPartyActorSheet.#onSelectMember,
      clearFilters: DASUPartyActorSheet.#onClearFilters,
      setLayout: DASUPartyActorSheet.#onSetLayout,
    },
    dragDrop: [{ dragSelector: '[data-uuid]', dropSelector: null }],
  };

  /** @override */
  static TABS = {
    primary: {
      tabs: [
        {
          id: 'summoners',
          label: 'DASU.Sheet.Tab.Summoners',
          icon: 'fas fa-users',
        },
        { id: 'roster', label: 'DASU.Sheet.Tab.Roster', icon: 'fas fa-dragon' },
        {
          id: 'storage',
          label: 'DASU.Sheet.Tab.Storage',
          icon: 'fas fa-box',
        },
        {
          id: 'items',
          label: 'DASU.Sheet.Tab.Items',
          icon: 'fa-solid fa-suitcase',
        },
        { id: 'effects', label: 'DASU.Sheet.Tab.Effects', icon: 'fas fa-bolt' },
      ],
      initial: 'summoners',
    },
  };

  /** @override */
  static PARTS = {
    header: { template: 'systems/dasu/templates/actor/party/header.hbs' },
    sidebar: { template: 'systems/dasu/templates/actor/party/sidebar.hbs' },
    tabs: { template: 'systems/dasu/templates/actor/parts/tab-navigation.hbs' },
    summoners: {
      template: 'systems/dasu/templates/actor/party/summoners.hbs',
      scrollable: [''],
    },
    roster: {
      template: 'systems/dasu/templates/actor/party/roster.hbs',
      scrollable: [''],
    },
    storage: {
      template: 'systems/dasu/templates/actor/party/storage.hbs',
      scrollable: [''],
    },
    items: {
      template: 'systems/dasu/templates/actor/party/items.hbs',
      scrollable: [''],
    },
    effects: {
      template: 'systems/dasu/templates/actor/party/effects.hbs',
      scrollable: [''],
    },
  };

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
    const system = actor.system;

    context.actor = actor;
    context.system = system;
    context.owner = actor.isOwner;

    context.summoners = await system.getMemberCardData();
    context.roster = await system.getRosterCardData();
    context.storage = await system.getStorageCardData();
    // Cache for the table renderers' row providers (they pull the same data).
    this.#cardData = {
      summoners: context.summoners,
      roster: context.roster,
      storage: context.storage,
    };

    // Card vs. table layout, shared across all three roster tabs and
    // persisted per-client (see the `partyLayout` setting).
    const layout = game.settings.get('dasu', 'partyLayout');
    context.layout = layout === 'table' ? 'table' : 'card';

    // Roster honours the sidebar owner selection; the others match on name
    // only. Both layouts read this same filter state.
    this.#filter.setPredicate(
      'roster',
      this.#ownerFilter ? (row) => row.ownerUuid === this.#ownerFilter : null
    );
    if (context.layout === 'table') {
      context.summonersTable = await this.#summonersTable.renderTable(actor, {
        isVisible: this.#filter.isVisible('summoners'),
      });
      context.rosterTable = await this.#rosterTable.renderTable(actor, {
        isVisible: this.#filter.isVisible('roster'),
      });
      context.storageTable = await this.#storageTable.renderTable(actor, {
        isVisible: this.#filter.isVisible('storage'),
      });
    }

    context.itemTable = await this.#itemTable.renderTable(this.document, {
      sectionBadge: {
        type: 'item',
        tooltip: game.i18n.localize('DASU.Sheet.AddItem'),
        used: '+',
      },
    });
    context.temporaryEffectsTable =
      await this.#temporaryEffectsTable.renderTable(this.document);
    context.passiveEffectsTable = await this.#passiveEffectsTable.renderTable(
      this.document
    );
    context.inactiveEffectsTable = await this.#inactiveEffectsTable.renderTable(
      this.document
    );

    const rollData = actor.getRollData();
    context.descriptionHTML =
      await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        system.description ?? '',
        { relativeTo: actor, secrets: actor.isOwner, rollData }
      );
    context.notesHTML =
      await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        system.notes ?? '',
        { relativeTo: actor, secrets: actor.isOwner, rollData }
      );

    return context;
  }

  /** @override */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.#itemTable.activateListeners(this);
    this.#temporaryEffectsTable.activateListeners(this);
    this.#passiveEffectsTable.activateListeners(this);
    this.#inactiveEffectsTable.activateListeners(this);
    this.#summonersTable.activateListeners(this);
    this.#rosterTable.activateListeners(this);
    this.#storageTable.activateListeners(this);
    this.#bindMemberRefresh();
  }

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
    this.#bindFilterSearch();
    this.#bindRosterHover();
    // Prune a stale selection (member removed) and reflect it in the DOM.
    if (
      this.#ownerFilter &&
      !this.element.querySelector(`[data-member-uuid="${this.#ownerFilter}"]`)
    ) {
      this.#ownerFilter = null;
    }
    // The just-rendered rows already reflect the filter (card DOM toggled here,
    // table filtered at render time); only sync the sidebar highlight. Do NOT
    // call #refreshRosterFilter, which may re-render and recurse into _onRender.
    this.#filter.setPredicate(
      'roster',
      this.#ownerFilter ? (row) => row.ownerUuid === this.#ownerFilter : null
    );
    this.#applyFilters(this.#filterBar('roster'));
    this.#syncMemberSelection();
  }

  /** Reflect the active owner selection on the sidebar member rows. */
  #syncMemberSelection() {
    for (const row of this.element.querySelectorAll('[data-member-uuid]')) {
      row.classList.toggle(
        'party-member-row--active',
        row.dataset.memberUuid === this.#ownerFilter
      );
    }
  }

  /**
   * Uuid of the member whose daemons the Roster is filtered to, or null for
   * all. Only the Roster tab honours it.
   * @type {string|null}
   */
  #ownerFilter = null;

  /** Whether the current layout is the server-rendered table layout. */
  get #isTableLayout() {
    return game.settings.get('dasu', 'partyLayout') === 'table';
  }

  /** Live text-search filtering, one listener per rendered filter bar. */
  #bindFilterSearch() {
    for (const bar of this.element.querySelectorAll('[data-filter-bar]')) {
      this.#filter.bindSearchBar(bar, (key) => this.#onSearchChanged(key));
      this.#applyFilters(bar);
    }
  }

  /** Card rows toggle in-place; table rows are server-filtered, so re-render. */
  #onSearchChanged(key) {
    if (this.#isTableLayout) this.#refreshTable(key);
    else this.#applyFilters(this.#filterBar(key));
  }

  #filterBar(key) {
    return this.element.querySelector(`[data-filter-bar="${key}"]`);
  }

  /**
   * Re-render a single section's part (table + filter bar) in table layout,
   * then restore focus and caret to the search input so live typing isn't
   * interrupted. A full part render (rather than an in-place node swap) lets
   * the table renderer rebind its own row listeners through the normal hook.
   */
  async #refreshTable(key) {
    const active = this.element.querySelector(
      `[data-filter-bar="${key}"] [data-filter-search]:focus`
    );
    const caret = active ? active.selectionStart : null;
    await this.render({ parts: [key] });
    if (caret == null) return;
    const input = this.element.querySelector(
      `[data-filter-bar="${key}"] [data-filter-search]`
    );
    if (input) {
      input.focus();
      input.setSelectionRange(caret, caret);
    }
  }

  /**
   * Card layout only: show/hide cards in a filter bar's tab per the shared
   * filter state. Table layout applies the same test at render time instead.
   */
  #applyFilters(bar) {
    if (!bar || this.#isTableLayout) return;
    const key = bar.dataset.filterBar;
    const visible = this.#filter.isVisible(key);
    const grid = bar.nextElementSibling;
    for (const card of grid.querySelectorAll('.party-card')) {
      const name =
        card.querySelector('.party-card__name')?.textContent.trim() ?? '';
      card.classList.toggle(
        'party-filtered-out',
        !visible({ name, ownerUuid: card.dataset.ownerUuid })
      );
    }
  }

  /** Re-apply the owner filter to the Roster tab (called after selection changes). */
  #refreshRosterFilter() {
    this.#filter.setPredicate(
      'roster',
      this.#ownerFilter ? (row) => row.ownerUuid === this.#ownerFilter : null
    );
    // Card layout toggles rows in the DOM; table layout is filtered at render.
    if (this.#isTableLayout) this.#refreshTable('roster');
    else this.#applyFilters(this.#filterBar('roster'));
    this.#syncMemberSelection();
  }

  /**
   * Hovering a Roster row transiently outlines its owner in the sidebar
   * member list (same affordance as a click-selection), cleared on unhover.
   * Uses a distinct `--hover` class so a real selection isn't disturbed.
   * Bound on the tab section so it covers both card and table layouts.
   */
  #bindRosterHover() {
    const grid = this.element.querySelector('.tab[data-tab="roster"]');
    if (!grid || grid.dataset.hoverBound) return;
    grid.dataset.hoverBound = 'true';
    const setHover = (uuid) => {
      for (const row of this.element.querySelectorAll('[data-member-uuid]')) {
        row.classList.toggle(
          'party-member-row--hover',
          !!uuid && row.dataset.memberUuid === uuid
        );
      }
    };
    grid.addEventListener('pointerover', (event) => {
      const card = event.target.closest('.party-card');
      setHover(card?.dataset.ownerUuid);
    });
    grid.addEventListener('pointerleave', () => setHover(null));
  }

  /**
   * Re-render when a member summoner (or its stock) changes, so the
   * Summoners/Roster cards stay live without a manual refresh.
   */
  #bindMemberRefresh() {
    const refreshIfMember = (actor) => {
      if (actor.type !== 'summoner') return;
      if (!this.actor.system.members.has(actor.uuid)) return;
      this.render();
    };
    this.#memberHookId = Hooks.on('updateActor', refreshIfMember);
  }

  /** Registered `updateActor` hook id for teardown on close. */
  #memberHookId = null;

  /** @override */
  async _onClose(options) {
    if (this.#memberHookId) Hooks.off('updateActor', this.#memberHookId);
    this.#memberHookId = null;
    return super._onClose(options);
  }

  /** @override */
  async _onDropActor(event, actorData) {
    const dropped = await fromUuid(actorData.uuid);
    if (!dropped) return false;

    if (dropped.type === 'summoner') {
      return this.actor.system.addMember(dropped);
    }

    if (dropped.type === 'daemon') {
      // Keyed off the active tab, not the drop point, so a drop anywhere in
      // the tab (not just on its drop-zone element) routes correctly.
      if (this.tabGroups?.primary === 'storage') {
        await this.actor.system.addToStorage(dropped.uuid);
        await linkDaemonToken(dropped);
        return true;
      }
      const summoner = await this.#pickTargetSummoner();
      if (!summoner) return false;
      return addDaemonToStock(summoner, dropped);
    }

    return false;
  }

  /**
   * Resolve which member summoner a dropped Roster daemon should join: the
   * sole member, or a prompt when there are several.
   * @returns {Promise<Actor|null>}
   */
  async #pickTargetSummoner() {
    const members = await this.actor.system.getMembers();
    if (!members.length) {
      ui.notifications?.warn(game.i18n.localize('DASU.Party.MembersEmpty'));
      return null;
    }
    if (members.length === 1) return members[0];

    // An active sidebar member selection names the target directly, so skip
    // the picker and add straight into that summoner's stock.
    if (this.#ownerFilter) {
      const filtered = members.find((m) => m.uuid === this.#ownerFilter);
      if (filtered) return filtered;
    }

    return foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize('DASU.Party.PickSummoner') },
      content: `<select name="summoner">${members
        .map((m) => `<option value="${m.uuid}">${m.name}</option>`)
        .join('')}</select>`,
      ok: {
        label: game.i18n.localize('DASU.Party.PickSummoner'),
        callback: (event, button) =>
          members.find((m) => m.uuid === button.form.elements.summoner.value) ??
          null,
      },
    });
  }

  /** Resolve a Roster row's daemon uuid and its owning summoner. */
  static async #resolveRosterRow(target) {
    const row = target.closest('[data-uuid]');
    const uuid = row?.dataset.uuid;
    const ownerUuid = row?.dataset.ownerUuid;
    if (!uuid || !ownerUuid) return {};
    const owner = await fromUuid(ownerUuid);
    return owner ? { uuid, owner } : {};
  }

  static #onOpenActor(event, target) {
    const uuid = target.closest('[data-uuid]')?.dataset.uuid;
    fromUuidSync(uuid)?.sheet?.render(true);
  }

  /** Card display name for confirmation prompts, read from the rendered row. */
  static #cardName(target) {
    return (
      target
        .closest('[data-uuid]')
        ?.querySelector('.party-card__name')
        ?.textContent.trim() ?? ''
    );
  }

  /**
   * DialogV2 yes/no gate for destructive removals.
   * @param {string} titleKey    i18n key for the window title.
   * @param {string} contentKey  i18n key for the body (receives `name`/`owner`).
   * @param {object} data        Interpolation data for the content.
   * @returns {Promise<boolean>}
   */
  static #confirmRemove(titleKey, contentKey, data) {
    return foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize(titleKey) },
      content: `<p>${game.i18n.format(contentKey, data)}</p>`,
      rejectClose: false,
      modal: true,
    });
  }

  static async #onRemoveMember(event, target) {
    const uuid = target.closest('[data-uuid]')?.dataset.uuid;
    if (!uuid) return;
    const confirmed = await DASUPartyActorSheet.#confirmRemove(
      'DASU.Party.ConfirmRemoveFromPartyTitle',
      'DASU.Party.ConfirmRemoveFromParty',
      { name: DASUPartyActorSheet.#cardName(target) }
    );
    if (confirmed) await this.actor.system.removeMember(uuid);
  }

  /**
   * Field/bench a roster daemon by flipping its `active` flag on the owning
   * summoner's stock. Benching also clears channeling, mirroring the combat
   * tracker so the shared stock stays consistent.
   */
  static async #onToggleActive(event, target) {
    event.stopPropagation();
    const { uuid, owner } = await DASUPartyActorSheet.#resolveRosterRow(target);
    if (!owner) return;
    const stock = foundry.utils.deepClone(owner.system.stock ?? []);
    const entry = stock.find((e) => e.uuid === uuid);
    if (!entry) return;
    entry.active = !entry.active;
    if (!entry.active) entry.channeled = false;
    await owner.update({ 'system.stock': stock });
  }

  /**
   * Toggle a roster daemon's `channeled` flag. Exclusive per summoner:
   * channeling one un-channels the rest of that summoner's stock.
   */
  static async #onToggleChanneled(event, target) {
    event.stopPropagation();
    const { uuid, owner } = await DASUPartyActorSheet.#resolveRosterRow(target);
    if (!owner) return;
    const stock = foundry.utils.deepClone(owner.system.stock ?? []);
    const entry = stock.find((e) => e.uuid === uuid);
    if (!entry) return;
    const next = !entry.channeled;
    for (const e of stock) e.channeled = false;
    entry.channeled = next;
    await owner.update({ 'system.stock': stock });
  }

  static async #onStoreDaemon(event, target) {
    const { uuid, owner } = await DASUPartyActorSheet.#resolveRosterRow(target);
    if (!owner) return;
    await moveToPartyStorage(this.actor, owner, uuid);
  }

  static async #onClaimDaemon(event, target) {
    const uuid = target.closest('[data-uuid]')?.dataset.uuid;
    if (!uuid) return;
    const summoner = await this.#pickTargetSummoner();
    if (!summoner) return;
    await claimFromPartyStorage(this.actor, summoner, uuid);
  }

  static async #onRemoveFromStorage(event, target) {
    const uuid = target.closest('[data-uuid]')?.dataset.uuid;
    if (!uuid) return;
    const confirmed = await DASUPartyActorSheet.#confirmRemove(
      'DASU.Party.ConfirmRemoveFromStorageTitle',
      'DASU.Party.ConfirmRemoveFromStorage',
      { name: DASUPartyActorSheet.#cardName(target) }
    );
    if (confirmed) await this.actor.system.removeFromStorage(uuid);
  }

  /** Toggle the sidebar member selection driving the Roster owner filter. */
  static #onSelectMember(event, target) {
    const uuid = target.dataset.memberUuid;
    if (!uuid) return;
    this.#ownerFilter = this.#ownerFilter === uuid ? null : uuid;
    this.#refreshRosterFilter();
  }

  /** Switch layout; persisted per-client and shared by all party sheets. */
  static async #onSetLayout(event, target) {
    const layout = target.dataset.layout;
    if (layout !== 'card' && layout !== 'table') return;
    if (game.settings.get('dasu', 'partyLayout') === layout) return;
    await game.settings.set('dasu', 'partyLayout', layout);
    this.render();
  }

  /** Clear the search text and owner filter for a tab's filter bar. */
  static #onClearFilters(event, target) {
    const bar = target.closest('[data-filter-bar]');
    const key = bar.dataset.filterBar;
    this.#filter.clear(key);
    const input = bar.querySelector('[data-filter-search]');
    if (input) input.value = '';
    if (key === 'roster') {
      // Clearing the Roster also drops the owner selection; let the roster
      // refresh (table re-render or DOM toggle) and sidebar sync flow through
      // the shared path so we don't render it twice.
      this.#ownerFilter = null;
      this.#refreshRosterFilter();
      return;
    }
    if (this.#isTableLayout) this.#refreshTable(key);
    else this.#applyFilters(bar);
  }
}
