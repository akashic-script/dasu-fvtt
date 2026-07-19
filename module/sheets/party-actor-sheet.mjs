const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
import { SheetLayoutMixin } from './mixins/sheet-layout-mixin.mjs';
import { ItemTableRenderer } from '../helpers/tables/item-table-renderer.mjs';
import { EffectTableRenderer } from '../helpers/tables/effect-table-renderer.mjs';
import { PartyTableRenderer } from '../helpers/tables/party-table-renderer.mjs';
import { TableFilter } from '../helpers/tables/table-filter.mjs';
import { prepareActiveEffectCategories } from '../helpers/effects.mjs';
import { resistanceChip } from '../helpers/tables/resistance-display.mjs';
import {
  addDaemonToStock,
  moveToPartyStorage,
  claimFromPartyStorage,
  linkDaemonToken,
  toggleStockActive,
  toggleStockChanneled,
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
    window: {
      resizable: true,
      icon: 'fas fa-people-group',
      controls: [
        {
          icon: 'fa-solid fa-star',
          label: 'DASU.Party.SetActive',
          action: 'toggleActiveParty',
          visible: () => game.user.isGM,
        },
      ],
    },
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
      toggleActiveParty: DASUPartyActorSheet.#onToggleActiveParty,
      setFusionPanel: DASUPartyActorSheet.#onSetFusionPanel,
      pickFusionParent: DASUPartyActorSheet.#onPickFusionParent,
      rollDaemonFusion: DASUPartyActorSheet.#onRollDaemonFusion,
      createFusedDaemon: DASUPartyActorSheet.#onCreateFusedDaemon,
      resetDaemonFusion: DASUPartyActorSheet.#onResetDaemonFusion,
      addFusionPair: DASUPartyActorSheet.#onAddFusionPair,
      removeFusionPair: DASUPartyActorSheet.#onRemoveFusionPair,
      rollAbilityFusion: DASUPartyActorSheet.#onRollAbilityFusion,
      createFusedAbility: DASUPartyActorSheet.#onCreateFusedAbility,
      resetAbilityFusion: DASUPartyActorSheet.#onResetAbilityFusion,
    },
    dragDrop: [{ dragSelector: '[data-uuid]', dropSelector: null }],
  };

  /** @override */
  get title() {
    const active = game.settings.get('dasu', 'activeParty') === this.actor.id;
    const prefix = `[${game.i18n.localize(
      active ? 'DASU.Party.Active' : 'DASU.Party.Inactive'
    )}] `;
    return `${prefix}${super.title}`;
  }

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
          id: 'fusion',
          label: 'DASU.Sheet.Tab.Fusion',
          icon: 'fas fa-atom',
        },
        {
          id: 'items',
          label: 'DASU.Sheet.Tab.Items',
          icon: 'fa-solid fa-suitcase',
        },
        {
          id: 'effects',
          label: 'DASU.Sheet.Tab.Effects',
          icon: 'fas fa-bolt',
          iconOnly: true,
        },
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
    fusion: {
      template: 'systems/dasu/templates/actor/party/fusion.hbs',
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
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    const active = game.settings.get('dasu', 'activeParty') === this.actor.id;
    const toggle = controls.find((c) => c.action === 'toggleActiveParty');
    if (toggle) {
      toggle.icon = active ? 'fa-solid fa-star' : 'fa-regular fa-star';
      toggle.label = active ? 'DASU.Party.UnsetActive' : 'DASU.Party.SetActive';
    }
    return controls;
  }

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
    context.isActiveParty =
      game.settings.get('dasu', 'activeParty') === actor.id;

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

    context.fusion = await this.#prepareFusionContext(system);

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
    this.#bindFusionInputs();
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

  /**
   * Which fusion sub-panel is showing: 'daemon' or 'ability'.
   * @type {'daemon'|'ability'}
   */
  #fusionPanel = 'daemon';

  /**
   * Default transient daemon-fusion state (not persisted). Refs are
   * `<parentUuid>::<itemId>`. `keep`: kept ability/tactic refs. `pairs`:
   * optional blends merging two abilities into one. `specialAbility`: which
   * parent's Special Ability survives (null = base parent's).
   */
  static #defaultDaemonFusion() {
    return {
      parentA: '',
      parentB: '',
      role: 'fighter',
      subtype: null,
      keep: [],
      pairs: [],
      pairBase: '',
      pairOther: '',
      name: '',
      roll: null,
      specialAbility: null,
    };
  }

  /** Default transient ability-fusion workbench state. */
  static #defaultAbilityFusion() {
    return {
      base: '',
      secondary: '',
      dropTags: [],
      addTags: [],
      name: '',
      roll: null,
    };
  }

  /** @type {ReturnType<typeof DASUPartyActorSheet.#defaultDaemonFusion>} */
  #daemonFusion = DASUPartyActorSheet.#defaultDaemonFusion();

  /** @type {ReturnType<typeof DASUPartyActorSheet.#defaultAbilityFusion>} */
  #abilityFusion = DASUPartyActorSheet.#defaultAbilityFusion();

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
   * Wire the Fusion workbench inputs. Fields whose value changes derived
   * options downstream, or that feed the live preview (parents, subtype,
   * abilities, role, daemon name), re-render the panel; others (special
   * ability, tags) just sync into transient state so a later button click
   * sees the latest values.
   */
  #bindFusionInputs() {
    const root = this.element;
    // These fields change which downstream controls show, so re-render.
    // Parents are card-click driven (#onPickFusionParent), not here.
    const rerenderFields = [
      'subtype',
      'keep',
      'baseAbility',
      'secondaryAbility',
      'role',
      'daemonName',
    ];
    const rerenderSel = rerenderFields
      .map((f) => `[data-fusion-field="${f}"]`)
      .join(', ');
    for (const el of root.querySelectorAll(rerenderSel)) {
      el.addEventListener('change', () => {
        this.#syncFusionState();
        this.render({ parts: ['fusion'] });
      });
    }
    // Non-structural fields: capture silently so buttons act on live values.
    for (const el of root.querySelectorAll(
      '[data-fusion-field="specialAbility"], [data-fusion-field="abilityName"], [data-fusion-field="dropTag"], [data-fusion-field="addTag"], [data-fusion-field="pairBase"], [data-fusion-field="pairOther"], [data-fusion-field="pairDrop"], [data-fusion-field="pairAdd"]'
    )) {
      el.addEventListener('change', () => this.#syncFusionState());
    }
    // Right-click a chosen parent card to open its sheet (left-click clears it).
    for (const card of root.querySelectorAll('.party-fusion__chosen-card')) {
      card.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        fromUuidSync(card.dataset.uuid)?.sheet?.render(true);
      });
    }
  }

  /**
   * Re-render when a member summoner (or its stock) changes, so the
   * Summoners/Roster cards stay live without a manual refresh.
   */
  #bindMemberRefresh() {
    const refreshIfMember = (actor) => {
      if (actor?.type !== 'summoner') return;
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

  /**
   * Great Fusion (double 10s): prompt for one player-chosen bonus. Returns a
   * payload for `createFusedDaemon`, or null if cancelled. `a`/`b` feed the
   * resistance-upgrade menu.
   * @returns {Promise<object|null>}
   */
  async #promptGreatBonus(a, b) {
    const L = (k) => game.i18n.localize(`DASU.Party.Fusion.${k}`);
    // Upgrade candidates: any resistance below Nullify (2) on either parent.
    const seen = new Set();
    const resOpts = [a, b]
      .flatMap((p) => p.resistances)
      .filter((r) => {
        if (r.level >= 2 || seen.has(r.type)) return false;
        seen.add(r.type);
        return true;
      })
      .map(
        (r) =>
          `<option value="${r.type}">${game.i18n.localize(
            `DASU.DamageType.${r.type[0].toUpperCase()}${r.type.slice(1)}`
          )}</option>`
      )
      .join('');

    const content = `
      <p>${L('GreatDesc')}</p>
      <div class="party-fusion__dialog">
        <label><input type="radio" name="bonus" value="avoid" checked /> ${L(
          'BonusAvoid'
        )}</label>
        <label><input type="radio" name="bonus" value="defense" /> ${L(
          'BonusDefense'
        )}</label>
        <label><input type="radio" name="bonus" value="resist" ${
          resOpts ? '' : 'disabled'
        } /> ${L('BonusResist')}</label>
        <select name="resType" ${resOpts ? '' : 'disabled'}>${
      resOpts || `<option value=""></option>`
    }</select>
      </div>`;

    return foundry.applications.api.DialogV2.prompt({
      window: { title: L('Great') },
      content,
      ok: {
        label: L('ApplyBonus'),
        callback: (event, button) => {
          const f = button.form.elements;
          const choice = f.bonus.value;
          if (choice === 'avoid') return { kind: 'stat', stat: 'avoid' };
          if (choice === 'defense') return { kind: 'stat', stat: 'defense' };
          if (choice === 'resist')
            return { kind: 'resist', type: f.resType.value };
          return null;
        },
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

  static async #onToggleActive(event, target) {
    event.stopPropagation();
    const { uuid, owner } = await DASUPartyActorSheet.#resolveRosterRow(target);
    if (!owner) return;
    await toggleStockActive(owner, uuid);
  }

  static async #onToggleChanneled(event, target) {
    event.stopPropagation();
    const { uuid, owner } = await DASUPartyActorSheet.#resolveRosterRow(target);
    if (!owner) return;
    await toggleStockChanneled(owner, uuid);
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

  /** GM-only: set this party active, or clear it if already active. */
  static async #onToggleActiveParty() {
    if (!game.user.isGM) return;
    const current = game.settings.get('dasu', 'activeParty');
    await game.settings.set(
      'dasu',
      'activeParty',
      current === this.actor.id ? '' : this.actor.id
    );
    this.render({ window: { title: this.title } });
  }

  // --- Fusion workbench --------------------------------------------------

  /**
   * Build the Fusion tab context from the pool + transient workbench state.
   * All the lookup math (result level, subtype, slot budget) is derived here
   * so the template stays declarative.
   */
  async #prepareFusionContext(system) {
    const pool = await system.getFusionPool();
    const byUuid = new Map(pool.map((d) => [d.uuid, d]));
    const roles = Object.entries(CONFIG.DASU.daemonRoles).map(
      ([id, label]) => ({
        id,
        label: game.i18n.localize(label),
      })
    );
    // --- Daemon fusion derived state ---
    const d = this.#daemonFusion;
    // Drop a parent that left the pool (removed from the party) so its slot
    // reopens; a ghost card can't be clicked to clear it otherwise.
    if (d.parentA && !byUuid.has(d.parentA)) d.parentA = '';
    if (d.parentB && !byUuid.has(d.parentB)) d.parentB = '';
    const a = byUuid.get(d.parentA);
    const b = byUuid.get(d.parentB);
    const bothPicked = !!a && !!b && a.uuid !== b.uuid;
    const level = bothPicked ? Math.max(a.level, b.level) : null;
    // Base = higher-level parent (ties -> A).
    const baseUuid = bothPicked ? (a.level >= b.level ? a.uuid : b.uuid) : '';
    // Subtype: higher of the two parents' subtypes, unless the player overrode it.
    const autoSubtype = bothPicked
      ? system.constructor.fusionAutoSubtype(a.subtype, b.subtype)
      : 'self';
    const subtype = d.subtype ?? autoSubtype;
    // Abilities and Tactics are separate slot pools, same cap each.
    const abilitySlots = system.constructor.fusionSlotsFor(subtype);
    const tacticSlots = system.constructor.fusionSlotsFor(subtype);

    // Only one parent's Special Ability survives; list every option, default
    // to the base parent's first.
    const specialAbilityOptions = bothPicked
      ? [a, b].flatMap((p) =>
          p.specialAbilities.map((sa) => ({
            ref: `${p.uuid}::${sa.id}`,
            name: sa.name,
            ownerName: p.name,
          }))
        )
      : [];
    const defaultSpecialAbilityRef =
      specialAbilityOptions.find((o) => o.ref.startsWith(`${baseUuid}::`))
        ?.ref ??
      specialAbilityOptions[0]?.ref ??
      '';
    const specialAbilityRef = d.specialAbility ?? defaultSpecialAbilityRef;

    // Keep pool: every ability/tactic across both parents is a candidate.
    const parents = bothPicked ? [a, b] : [];
    const keepItems = parents.flatMap((p) => [
      ...p.abilities.map((i) => ({
        ref: `${p.uuid}::${i.id}`,
        uuid: i.uuid,
        name: i.name,
        kind: 'ability',
        ownerName: p.name,
      })),
      ...p.tactics.map((i) => ({
        ref: `${p.uuid}::${i.id}`,
        uuid: i.uuid,
        name: i.name,
        kind: 'tactic',
        ownerName: p.name,
      })),
    ]);
    const keepByRef = new Map(keepItems.map((k) => [k.ref, k]));
    // Keepsakes default to all-checked; the player unchecks down to the
    // slot cap rather than opting in item by item.
    if (d.keep.length === 0 && keepItems.length > 0) {
      d.keep = keepItems.map((k) => k.ref);
    }
    const kept = new Set(d.keep);
    // Refs consumed by an Ability-Fusion pair are no longer plain keeps.
    const paired = new Set(d.pairs.flatMap((p) => [p.baseRef, p.otherRef]));

    const pairs = [];
    for (let i = 0; i < d.pairs.length; i++) {
      const pair = d.pairs[i];
      const baseK = keepByRef.get(pair.baseRef);
      const otherK = keepByRef.get(pair.otherRef);
      if (!baseK || !otherK) continue; // a parent changed underneath it
      const baseDoc = await fromUuid(baseK.uuid);
      const otherDoc = await fromUuid(otherK.uuid);
      if (baseDoc?.type !== 'ability' || otherDoc?.type !== 'ability') continue;
      pairs.push({
        index: i,
        baseName: baseK.name,
        otherName: otherK.name,
        chassis: DASUPartyActorSheet.#chassis(baseDoc),
        dropTags: DASUPartyActorSheet.#tagList(baseDoc).map((t) => ({
          ...t,
          checked: pair.drop.includes(t.id),
        })),
        addTags: DASUPartyActorSheet.#tagList(otherDoc).map((t) => ({
          ...t,
          checked: pair.add.includes(t.id),
        })),
      });
    }

    // Pair builder: only kept abilities not already consumed by a pair.
    const pairCandidates = keepItems.filter(
      (k) => k.kind === 'ability' && kept.has(k.ref) && !paired.has(k.ref)
    );

    // Split by category so the template can group Abilities and Tactics.
    const keepRows = keepItems.map((k) => ({
      ...k,
      checked: kept.has(k.ref),
      inPair: paired.has(k.ref),
    }));
    const keepAbilities = keepRows.filter((k) => k.kind === 'ability');
    const keepTactics = keepRows.filter((k) => k.kind === 'tactic');

    // A blend pair merges two abilities into one, so it costs one slot.
    const abilitySlotsUsed =
      keepAbilities.filter((k) => k.checked && !k.inPair).length + pairs.length;
    const tacticSlotsUsed = keepTactics.filter((k) => k.checked).length;

    // Localise a daemon's Role keys to display labels.
    const roleLabels = (rolesArr) =>
      (rolesArr ?? [])
        .map((r) => game.i18n.localize(CONFIG.DASU.daemonRoles[r] ?? ''))
        .filter(Boolean);

    // Parent-picker cards: the pool minus the already-chosen parents.
    const poolCards = pool
      .filter((p) => p.uuid !== d.parentA && p.uuid !== d.parentB)
      .map((p) => ({
        uuid: p.uuid,
        name: p.name,
        img: p.img,
        level: p.level,
      }));

    // Base = higher-level parent, feeds the result preview.
    const base = a && b ? (a.level >= b.level ? a : b) : null;
    const roleLabel = game.i18n.localize(
      CONFIG.DASU.daemonRoles[d.role] ?? d.role
    );
    const overSlots =
      abilitySlotsUsed > abilitySlots || tacticSlotsUsed > tacticSlots;

    // Result resistances = the base (higher-level) parent's, plus any Great
    // Fusion +1 step upgrade the player claimed. Full 8-type row, like the
    // roster's expand row.
    const previewResistances = base
      ? DASUPartyActorSheet.#previewResistances(base.uuid, d.roll)
      : [];

    const daemon = {
      pool,
      poolCards,
      parentA: d.parentA,
      parentB: d.parentB,
      a,
      b,
      aRoles: a ? roleLabels(a.roles) : [],
      bRoles: b ? roleLabels(b.roles) : [],
      bothPicked,
      level,
      baseUuid,
      baseImg: base?.img ?? '',
      subtype,
      subtypeAuto: !d.subtype,
      abilitySlots,
      abilitySlotsUsed,
      abilitySlotsPct: abilitySlots
        ? Math.min(100, (abilitySlotsUsed / abilitySlots) * 100)
        : 0,
      tacticSlots,
      tacticSlotsUsed,
      tacticSlotsPct: tacticSlots
        ? Math.min(100, (tacticSlotsUsed / tacticSlots) * 100)
        : 0,
      role: d.role,
      roleLabel,
      specialAbilityOptions,
      showResultHints: !d.subtype || specialAbilityOptions.length > 0,
      specialAbility: specialAbilityRef,
      keepAbilities,
      keepTactics,
      pairs,
      pairCandidates,
      pairBase: d.pairBase,
      pairOther: d.pairOther,
      canAddPair: pairCandidates.length >= 2,
      showPairFieldset: pairs.length > 0 || pairCandidates.length >= 2,
      name: d.name,
      previewName:
        (d.name || '').trim() || (base ? `${base.name} (Fused)` : ''),
      roll: d.roll,
      overSlots,
      createDisabled: !d.roll || overSlots,
      previewResistances,
    };

    // --- Ability fusion derived state ---
    const abilities = pool.flatMap((p) =>
      p.abilities.map((ab) => ({ ...ab, ownerName: p.name }))
    );
    const abByUuid = new Map(abilities.map((ab) => [ab.uuid, ab]));
    const af = this.#abilityFusion;
    const baseAb = await this.#resolveAbility(af.base);
    const secAb = await this.#resolveAbility(af.secondary);
    const bothAb = !!baseAb && !!secAb && baseAb.uuid !== secAb.uuid;
    const overrideSlots = bothAb
      ? Math.max(0, Math.max(baseAb.aptitude, secAb.aptitude) - 1)
      : 0;

    const ability = {
      abilities,
      base: af.base,
      secondary: af.secondary,
      baseInfo: abByUuid.get(af.base) ?? null,
      baseChassis: baseAb ? DASUPartyActorSheet.#chassis(baseAb.doc) : null,
      baseTags: baseAb ? DASUPartyActorSheet.#tagList(baseAb.doc) : [],
      secTags: secAb ? DASUPartyActorSheet.#tagList(secAb.doc) : [],
      dropTags: af.dropTags,
      addTags: af.addTags,
      overrideSlots,
      overridesUsed: Math.max(af.dropTags.length, af.addTags.length),
      bothPicked: bothAb,
      name: af.name,
      roll: af.roll,
      canCreate: bothAb,
    };

    return { panel: this.#fusionPanel, roles, daemon, ability };
  }

  /** Read the base ability's locked chassis stats for display. */
  static #chassis(ability) {
    const s = ability.system;
    return {
      category: game.i18n.localize(
        CONFIG.DASU.abilityCategories[s.category] ?? s.category
      ),
      aptitude: s.aptitude?.value ?? 1,
      damage: s.damage?.value ?? 0,
      heal: s.heal?.value ?? 0,
      cost: s.resource?.value ?? 0,
      toHit: s.isInfinity ? '∞' : s.toHit,
    };
  }

  /** Serialised tag rows for the ability-fusion pickers. */
  static #tagList(ability) {
    return [...(ability.system.tags ?? [])].map((t) => ({
      id: t._id ?? t.id,
      name: t.name ?? t._id,
      rank: t.rank?.current ?? 1,
    }));
  }

  /**
   * Full 8-type resistance row for the fusion preview: the base parent's
   * resistances with any Great Fusion +1 step upgrade folded in.
   * @param {string} baseUuid  The higher-level parent's uuid.
   * @param {object|null} roll  Current fusion roll (may carry a Great bonus).
   */
  static #previewResistances(baseUuid, roll) {
    const sys = fromUuidSync(baseUuid)?.system;
    if (!sys) return [];
    const upgrade = roll?.bonus?.kind === 'resist' ? roll.bonus.type : null;
    return CONFIG.DASU.resistanceTypes.map((key) => {
      let level = sys.resistances?.[key]?.base ?? 0;
      if (key === upgrade) level = Math.min(3, level + 1);
      return {
        key,
        label: game.i18n.localize(
          `DASU.DamageType.${key[0].toUpperCase()}${key.slice(1)}`
        ),
        ...resistanceChip(level),
      };
    });
  }

  /** Resolve an ability uuid to `{ uuid, doc, aptitude }`, or null. */
  async #resolveAbility(uuid) {
    if (!uuid) return null;
    const doc = await fromUuid(uuid);
    if (doc?.type !== 'ability') return null;
    return { uuid, doc, aptitude: doc.system?.aptitude?.value ?? 1 };
  }

  /**
   * Sync transient workbench state from the DOM before an action runs, so
   * buttons act on the latest values without a form submit.
   */
  #syncFusionState() {
    const root = this.element;
    const val = (sel) => root.querySelector(sel)?.value ?? '';
    const checkedVals = (sel) =>
      [...root.querySelectorAll(sel)]
        .filter((c) => c.checked)
        .map((c) => c.value);

    const d = this.#daemonFusion;
    if (root.querySelector('[data-fusion="daemon"]')) {
      // parentA/parentB come from the card picker, not the DOM.
      d.role = val('[data-fusion-field="role"]') || d.role;
      const sub = val('[data-fusion-field="subtype"]');
      d.subtype = sub || null;
      const sa = val('[data-fusion-field="specialAbility"]');
      d.specialAbility = sa || null;
      d.keep = checkedVals('[data-fusion-field="keep"]');
      d.name = val('[data-fusion-field="daemonName"]');
      d.pairBase = val('[data-fusion-field="pairBase"]');
      d.pairOther = val('[data-fusion-field="pairOther"]');
      // Per-pair tag overrides, keyed by the pair's index on its container.
      for (const box of root.querySelectorAll('[data-pair-index]')) {
        const idx = Number(box.dataset.pairIndex);
        const pair = d.pairs[idx];
        if (!pair) continue;
        pair.drop = [
          ...box.querySelectorAll('[data-fusion-field="pairDrop"]:checked'),
        ].map((c) => c.value);
        pair.add = [
          ...box.querySelectorAll('[data-fusion-field="pairAdd"]:checked'),
        ].map((c) => c.value);
      }
    }

    const af = this.#abilityFusion;
    if (root.querySelector('[data-fusion="ability"]')) {
      af.base = val('[data-fusion-field="baseAbility"]');
      af.secondary = val('[data-fusion-field="secondaryAbility"]');
      af.dropTags = checkedVals('[data-fusion-field="dropTag"]');
      af.addTags = checkedVals('[data-fusion-field="addTag"]');
      af.name = val('[data-fusion-field="abilityName"]');
    }
  }

  /**
   * Roll 2d10 and classify: double-10 = great, double-1 = accident, else
   * clean. `allowGreat: false` (Ability Fusion, no great bonus) treats
   * double-10 as clean.
   * @param {string} flavor  Chat card flavor line.
   * @param {object} [options]
   * @param {boolean} [options.allowGreat]
   * @returns {Promise<{kind:'great'|'accident'|'clean', a:number, b:number, total:number}>}
   */
  async #rollFusion(flavor, { allowGreat = true } = {}) {
    const roll = new Roll('2d10');
    await roll.evaluate();
    const [d1, d2] = roll.dice[0].results.map((r) => r.result);
    let kind = 'clean';
    if (allowGreat && d1 === 10 && d2 === 10) kind = 'great';
    else if (d1 === 1 && d2 === 1) kind = 'accident';
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor,
    });
    return { kind, a: d1, b: d2, total: roll.total };
  }

  /** Switch the Daemon/Ability sub-panel. */
  static #onSetFusionPanel(event, target) {
    const panel = target.dataset.panel;
    if (panel !== 'daemon' && panel !== 'ability') return;
    this.#syncFusionState();
    this.#fusionPanel = panel;
    this.render({ parts: ['fusion'] });
  }

  /**
   * Click-to-pick a parent. Clicking a chosen card clears its slot; a new card
   * fills the first empty slot (A, then B), else replaces B.
   */
  static #onPickFusionParent(event, target) {
    this.#syncFusionState();
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    const d = this.#daemonFusion;
    if (d.parentA === uuid) d.parentA = '';
    else if (d.parentB === uuid) d.parentB = '';
    else if (!d.parentA) d.parentA = uuid;
    else if (!d.parentB) d.parentB = uuid;
    else d.parentB = uuid;
    // A parent change invalidates the downstream state (refs point at parent
    // items) and the roll (shaped around the old pairing), so reset both.
    d.keep = [];
    d.pairs = [];
    d.pairBase = '';
    d.pairOther = '';
    d.specialAbility = null;
    d.roll = null;
    d.role = 'fighter';
    this.render({ parts: ['fusion'] });
  }

  /**
   * Roll before the result is shaped, so its extremes steer the choices. A
   * Great Fusion's bonus and an Accident's direction are resolved here; Wrong
   * Shape also hands Role to the Judge, locking the player's Role selector.
   */
  static async #onRollDaemonFusion() {
    this.#syncFusionState();
    const d = this.#daemonFusion;
    if (!d.parentA || !d.parentB || d.parentA === d.parentB) {
      ui.notifications?.warn(
        game.i18n.localize('DASU.Party.Fusion.NeedTwoParents')
      );
      return;
    }
    const pool = await this.actor.system.getFusionPool();
    const a = pool.find((p) => p.uuid === d.parentA);
    const b = pool.find((p) => p.uuid === d.parentB);
    if (!a || !b) return;

    const roll = await this.#rollFusion(
      game.i18n.localize('DASU.Party.Fusion.DaemonRollFlavor')
    );

    if (roll.kind === 'great') {
      const bonus = await this.#promptGreatBonus(a, b);
      if (bonus === null) return; // cancelled; keep the previous roll state
      roll.bonus = bonus;
    } else if (roll.kind === 'accident') {
      // Only one Accident direction exists for now, so apply it directly.
      roll.accident = { kind: 'chimeric' };
    }

    d.roll = roll;
    this.render({ parts: ['fusion'] });
  }

  static async #onCreateFusedDaemon() {
    this.#syncFusionState();
    const d = this.#daemonFusion;
    if (!d.parentA || !d.parentB || d.parentA === d.parentB) {
      ui.notifications?.warn(
        game.i18n.localize('DASU.Party.Fusion.NeedTwoParents')
      );
      return;
    }
    const pool = await this.actor.system.getFusionPool();
    const a = pool.find((p) => p.uuid === d.parentA);
    const b = pool.find((p) => p.uuid === d.parentB);
    if (!a || !b) return;
    const level = Math.max(a.level, b.level);
    const baseUuid = a.level >= b.level ? a.uuid : b.uuid;
    const subtype =
      d.subtype ??
      this.actor.system.constructor.fusionAutoSubtype(a.subtype, b.subtype);

    // Each plain keep becomes an item; each pair becomes one blend. Refs
    // consumed by a pair are skipped from the plain-keep set.
    const paired = new Set(d.pairs.flatMap((p) => [p.baseRef, p.otherRef]));
    const keepsakes = [];
    let abilityKeepCount = 0;
    let tacticKeepCount = 0;
    for (const ref of d.keep) {
      if (paired.has(ref)) continue;
      const parsed = DASUPartyActorSheet.#parseKeepRef(ref);
      if (!parsed) continue;
      const owner = a.uuid === parsed.fromUuid ? a : b;
      if (owner.abilities.some((x) => x.id === parsed.id)) abilityKeepCount++;
      else if (owner.tactics.some((x) => x.id === parsed.id)) tacticKeepCount++;
      keepsakes.push({ kind: 'item', ...parsed });
    }
    const abilitySlotsUsed = abilityKeepCount + d.pairs.length;
    const tacticSlotsUsed = tacticKeepCount;
    const slotCap = this.actor.system.constructor.fusionSlotsFor(subtype);
    if (abilitySlotsUsed > slotCap || tacticSlotsUsed > slotCap) {
      ui.notifications?.warn(game.i18n.localize('DASU.Party.Fusion.OverSlots'));
      return;
    }
    for (const pair of d.pairs) {
      const base = DASUPartyActorSheet.#parseKeepRef(pair.baseRef);
      const other = DASUPartyActorSheet.#parseKeepRef(pair.otherRef);
      if (!base || !other) continue;
      const baseItem = a.uuid === base.fromUuid ? a : b;
      const otherItem = a.uuid === other.fromUuid ? a : b;
      const baseAb = baseItem.abilities.find((x) => x.id === base.id);
      const otherAb = otherItem.abilities.find((x) => x.id === other.id);
      if (!baseAb || !otherAb) continue;
      keepsakes.push({
        kind: 'blend',
        baseUuid: baseAb.uuid,
        secondaryUuid: otherAb.uuid,
        dropTagIds: pair.drop,
        addTagIds: pair.add,
      });
    }

    // Roll extremes were resolved at roll time; the payload rides along.
    if (!d.roll) {
      ui.notifications?.warn(
        game.i18n.localize('DASU.Party.Fusion.RollFirstHint')
      );
      return;
    }
    const bonus = d.roll.bonus ?? null;
    const accident = d.roll.accident ?? null;

    const specialAbility = DASUPartyActorSheet.#parseKeepRef(d.specialAbility);

    const created = await this.actor.system.createFusedDaemon({
      baseUuid,
      role: d.role,
      subtype,
      level,
      keepsakes,
      name: d.name,
      bonus,
      accident,
      specialAbility,
    });
    if (created) {
      ui.notifications?.info(
        game.i18n.format('DASU.Party.Fusion.DaemonCreated', {
          name: created.name,
        })
      );
      this.#daemonFusion.roll = null;
      this.render();
    }
  }

  /** Split a keep ref `<parentUuid>::<itemId>` into `{ fromUuid, id }`. */
  static #parseKeepRef(ref) {
    const [fromUuid, id] = String(ref).split('::');
    return fromUuid && id ? { fromUuid, id } : null;
  }

  /** Add an Ability-Fusion pair from the two builder selects. */
  static #onAddFusionPair() {
    this.#syncFusionState();
    const d = this.#daemonFusion;
    const { pairBase, pairOther } = d;
    if (!pairBase || !pairOther || pairBase === pairOther) {
      ui.notifications?.warn(
        game.i18n.localize('DASU.Party.Fusion.PairNeedsTwo')
      );
      return;
    }
    // Guard against re-pairing an ability already in a pair.
    const paired = new Set(d.pairs.flatMap((p) => [p.baseRef, p.otherRef]));
    if (paired.has(pairBase) || paired.has(pairOther)) return;
    d.pairs.push({ baseRef: pairBase, otherRef: pairOther, drop: [], add: [] });
    d.pairBase = '';
    d.pairOther = '';
    this.render({ parts: ['fusion'] });
  }

  /** Remove an Ability-Fusion pair by index, freeing its abilities. */
  static #onRemoveFusionPair(event, target) {
    this.#syncFusionState();
    const index = Number(target.dataset.pairIndex);
    if (Number.isInteger(index)) this.#daemonFusion.pairs.splice(index, 1);
    this.render({ parts: ['fusion'] });
  }

  static #onResetDaemonFusion() {
    this.#daemonFusion = DASUPartyActorSheet.#defaultDaemonFusion();
    this.render({ parts: ['fusion'] });
  }

  static async #onRollAbilityFusion() {
    this.#syncFusionState();
    const af = this.#abilityFusion;
    if (!af.base || !af.secondary || af.base === af.secondary) {
      ui.notifications?.warn(
        game.i18n.localize('DASU.Party.Fusion.NeedTwoAbilities')
      );
      return;
    }
    af.roll = await this.#rollFusion(
      game.i18n.localize('DASU.Party.Fusion.AbilityRollFlavor'),
      { allowGreat: false }
    );
    this.render({ parts: ['fusion'] });
  }

  static async #onCreateFusedAbility() {
    this.#syncFusionState();
    const af = this.#abilityFusion;
    if (!af.base || !af.secondary || af.base === af.secondary) {
      ui.notifications?.warn(
        game.i18n.localize('DASU.Party.Fusion.NeedTwoAbilities')
      );
      return;
    }
    // Override slots = higher aptitude − 1; block over-budget swaps.
    const baseAb = await this.#resolveAbility(af.base);
    const secAb = await this.#resolveAbility(af.secondary);
    const overrideSlots = Math.max(
      0,
      Math.max(baseAb?.aptitude ?? 1, secAb?.aptitude ?? 1) - 1
    );
    if (
      af.dropTags.length > overrideSlots ||
      af.addTags.length > overrideSlots
    ) {
      ui.notifications?.warn(
        game.i18n.format('DASU.Party.Fusion.OverrideSlotsExceeded', {
          max: overrideSlots,
        })
      );
      return;
    }
    const created = await this.actor.system.createFusedAbility({
      baseUuid: af.base,
      secondaryUuid: af.secondary,
      dropTagIds: af.dropTags,
      addTagIds: af.addTags,
      name: af.name,
    });
    if (created) {
      ui.notifications?.info(
        game.i18n.format('DASU.Party.Fusion.AbilityCreated', {
          name: created.name,
        })
      );
      this.#abilityFusion.roll = null;
      this.render();
    }
  }

  static #onResetAbilityFusion() {
    this.#abilityFusion = DASUPartyActorSheet.#defaultAbilityFusion();
    this.render({ parts: ['fusion'] });
  }
}
