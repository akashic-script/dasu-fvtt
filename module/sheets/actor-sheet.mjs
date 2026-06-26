const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
import {
  onManageActiveEffect,
  prepareActiveEffectCategories,
} from '../helpers/effects.mjs';
import { SheetLayoutMixin } from './mixins/sheet-layout-mixin.mjs';
import { DASU } from '../helpers/config.mjs';
import { WeaponTableRenderer } from '../helpers/tables/weapon-table-renderer.mjs';
import { AbilityTableRenderer } from '../helpers/tables/ability-table-renderer.mjs';
import { ItemTableRenderer } from '../helpers/tables/item-table-renderer.mjs';
import { FeatureTableRenderer } from '../helpers/tables/feature-table-renderer.mjs';
import { TacticTableRenderer } from '../helpers/tables/tactic-table-renderer.mjs';
import { ClassTableRenderer } from '../helpers/tables/class-table-renderer.mjs';
import { ArchetypeTableRenderer } from '../helpers/tables/archetype-table-renderer.mjs';
import { SubtypeTableRenderer } from '../helpers/tables/subtype-table-renderer.mjs';
import { SchemaTableRenderer } from '../helpers/tables/schema-table-renderer.mjs';
import { EffectTableRenderer } from '../helpers/tables/effect-table-renderer.mjs';
import { StockTableRenderer } from '../helpers/tables/stock-table-renderer.mjs';
import { DaemonTables } from '../helpers/tables/daemon-tables.mjs';
import { BondTableRenderer } from '../helpers/tables/bond-table-renderer.mjs';
import { FieldsetStateManager } from '../helpers/fieldset-state.mjs';
import { DASURollDialog } from '../ui/roll-dialog.mjs';
import { SYSTEM } from '../helpers/config.mjs';
import { Flags } from '../helpers/flags.mjs';

export class DASUActorSheet extends SheetLayoutMixin(
  HandlebarsApplicationMixin(ActorSheetV2)
) {
  static MODES = { PLAY: 1, EDIT: 2 };

  static #moduleTableRegistry = [];

  /**
   * Register a custom item table to be rendered on the actor sheet.
   * Call during Hooks.once('init').
   *
   * @param {DASUTableRenderer} renderer - instantiated table renderer
   * @param {'items'|'syn'} tab - actor sheet tab to append the table to
   */
  static registerItemTable(renderer, tab = 'items') {
    DASUActorSheet.#moduleTableRegistry.push({ renderer, tab });
  }

  _mode = null;

  #daemonTableCache = new Map();

  #weaponTable = new WeaponTableRenderer();
  #abilityTable = new AbilityTableRenderer();
  #tacticTable = new TacticTableRenderer();
  #fieldsets = new FieldsetStateManager([
    {
      id: 'identity-editor',
      defaultPanel: 'biography',
      panels: ['biography', 'notes'],
    },
    {
      id: 'planner',
      defaultPanel: 'reached',
      defaultSplit: true,
      panels: ['reached', 'future'],
    },
    {
      id: 'syn-stock',
      defaultPanel: 'stock',
      panels: ['stock'],
    },
  ]);

  #activeStockTable = new StockTableRenderer('active');
  #inactiveStockTable = new StockTableRenderer('inactive');
  #bondTable = new BondTableRenderer();
  #classTable = new ClassTableRenderer();
  #archetypeTable = new ArchetypeTableRenderer();
  #subtypeTable = new SubtypeTableRenderer();
  #schemaTable = new SchemaTableRenderer();
  #itemTable = new ItemTableRenderer();
  #featureTable = new FeatureTableRenderer();
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

  get isEditMode() {
    return this._mode === this.constructor.MODES.EDIT;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ['dasu', 'sheet', 'actor'],
    position: { width: 640, height: 900 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      roll: DASUActorSheet.#onRoll,
      rollAttribute: DASUActorSheet.#onRollAttribute,
      rollSkill: DASUActorSheet.#onRollSkill,
      resourceStep: DASUActorSheet.#onResourceStep,
      openResourcePopover: DASUActorSheet.#onOpenResourcePopover,
      openMeritPopover: DASUActorSheet.#onOpenMeritPopover,
      skillStep: DASUActorSheet.#onSkillStep,
      aptitudeStep: DASUActorSheet.#onAptitudeStep,
      createCustomSkill: DASUActorSheet.#onCreateCustomSkill,
      deleteCustomSkill: DASUActorSheet.#onDeleteCustomSkill,
      advance: DASUActorSheet.#onAdvance,
      fieldsetTab: DASUActorSheet.#onFieldsetTab,
      fieldsetSplit: DASUActorSheet.#onFieldsetSplit,
      showResistance: DASUActorSheet.#onShowResistance,
      plannerUnslot: DASUActorSheet.#onPlannerUnslot,
      plannerOpenItem: DASUActorSheet.#onPlannerOpenItem,
      plannerEditClass: DASUActorSheet.#onPlannerEditClass,
    },
  };

  /** @override */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    this._mode = options.mode ?? this._mode ?? this.constructor.MODES.PLAY;
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
    const actorData = actor.system;

    context.actor = actor;
    context.data = actor.toObject();
    context.system = actorData;
    context.flags = actor.flags;
    if (actorData.ap) context.ap = actorData.ap;
    if (actorData.sp) context.sp = actorData.sp;
    context.cssClass = [...this.options.classes, actor.type].join(' ');
    context.owner = actor.isOwner;
    context.isEditMode = this.isEditMode;

    context.resistanceLevelOptions = DASU.resistanceLevels;

    const RESISTANCE_ABBR = { '-1': 'WK', 0: '–', 1: 'RS', 2: 'NU', 3: 'DR' };
    const RESISTANCE_CLASS = {
      '-1': 'resistance--weak',
      0: '',
      1: 'resistance--resist',
      2: 'resistance--nullify',
      3: 'resistance--drain',
    };
    context.resistances = Object.fromEntries(
      DASU.resistanceTypes.map((key) => {
        const base = actorData.resistances?.[key]?.base ?? 0;
        return [
          key,
          {
            base,
            abbr: RESISTANCE_ABBR[String(base)] ?? '',
            cssClass: RESISTANCE_CLASS[String(base)] ?? '',
          },
        ];
      })
    );

    context.aptitudes = Object.fromEntries(
      Object.keys(DASU.aptitudes).map((key) => {
        const apt = actorData.aptitudes[key];
        return [key, { ...apt, isZero: apt.value <= 0 }];
      })
    );

    context.items = Array.from(actor.items.values());
    context.items.sort((a, b) => (a.sort || 0) - (b.sort || 0));

    this._prepareItems(context);
    context.weaponTable = await this.#weaponTable.renderTable(this.document, {
      sectionBadge: {
        type: 'weapon',
        tooltip: game.i18n.localize('DASU.Sheet.AddItem'),
        used: '+',
      },
    });
    const slots = actorData.slots;
    context.abilityTable = await this.#abilityTable.renderTable(this.document, {
      sectionBadge: slots?.ability ? {
        type: 'ability',
        tooltip: game.i18n.localize('DASU.Actor.Slots.AbilityLong'),
        used: slots.ability.used,
        max: slots.ability.max,
      } : {
        type: 'ability',
        tooltip: game.i18n.localize('DASU.Sheet.AddItem'),
        used: '+',
      },
    });
    context.tacticTable = await this.#tacticTable.renderTable(this.document, {
      sectionBadge: slots?.tactic ? {
        type: 'tactic',
        tooltip: game.i18n.localize('DASU.Actor.Slots.TacticLong'),
        used: slots.tactic.used,
        max: slots.tactic.max,
      } : {
        type: 'tactic',
        tooltip: game.i18n.localize('DASU.Sheet.AddItem'),
        used: '+',
      },
    });
    context.schemaTable = await this.#schemaTable.renderTable(this.document);
    context.classTable = await this.#classTable.renderTable(this.document);
    context.planner = this.#preparePlanner(actor);
    context.apt = {
      spent: Object.keys(DASU.aptitudes).reduce(
        (sum, key) => sum + Math.max(0, actorData.aptitudes[key]?.bonus ?? 0),
        0
      ),
      max: context.planner.aptitudeMax,
    };
    context.itemTable = await this.#itemTable.renderTable(this.document, {
      sectionBadge: {
        type: 'item',
        tooltip: game.i18n.localize('DASU.Sheet.AddItem'),
        used: '+',
      },
    });
    context.featureTable = await this.#featureTable.renderTable(this.document);
    if (actor.type === 'summoner') {
      context.bondTable = await this.#bondTable.renderTable(this.document);
    }

    context.archetypeTable = await this.#archetypeTable.renderTable(
      this.document
    );
    context.subtypeTable = await this.#subtypeTable.renderTable(this.document);

    context.fieldsets = this.#fieldsets.prepareContext(actor);

    if (actor.type === 'summoner') {
      context.activeStockTable = await this.#activeStockTable.renderTable(this.document, {
        sectionBadge: { tooltip: game.i18n.localize('DASU.Stock.Active'), used: game.i18n.localize('DASU.Stock.Active') },
      });
      context.inactiveStockTable = await this.#inactiveStockTable.renderTable(this.document, {
        sectionBadge: { tooltip: game.i18n.localize('DASU.Stock.Inactive'), used: game.i18n.localize('DASU.Stock.Inactive') },
      });

      const activeStock = (actor.system.stock ?? [])
        .filter(e => e.active)
        .map(e => fromUuidSync(e.uuid))
        .filter(d => d?.type === 'daemon');

      const activeUuids = new Set(activeStock.map(d => d.uuid));
      for (const uuid of this.#daemonTableCache.keys())
        if (!activeUuids.has(uuid)) this.#daemonTableCache.delete(uuid);

      for (const daemon of activeStock) {
        if (!this.#daemonTableCache.has(daemon.uuid)) {
          this.#daemonTableCache.set(daemon.uuid, new DaemonTables(daemon.uuid));
        }
      }

      context.daemonTabs = (await Promise.all(
        [...this.#daemonTableCache.values()].map(t => t.render())
      )).filter(Boolean);
      context.daemonAckTabs = (await Promise.all(
        [...this.#daemonTableCache.values()].map(t => t.renderAck())
      )).filter(Boolean);
      context.useDaemonItemTabs = true;
    }

    context.moduleItemTables = await Promise.all(
      DASUActorSheet.#moduleTableRegistry.map(async ({ renderer, tab }) => ({
        tab,
        html: await renderer.renderTable(this.document),
      }))
    );

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

    context.notesHTML =
      await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        actor.system.notes ?? '',
        {
          relativeTo: actor,
          secrets: actor.isOwner,
          rollData: context.rollData,
        }
      );

    const hp = actorData.resources?.hp ?? {};
    const wp = actorData.resources?.wp ?? {};
    context.healthPercent =
      hp.max > 0 ? Math.min(100, Math.max(0, (hp.value / hp.max) * 100)) : 0;
    context.powerPercent =
      wp.max > 0 ? Math.min(100, Math.max(0, (wp.value / wp.max) * 100)) : 0;

    context.temporaryEffectsTable =
      await this.#temporaryEffectsTable.renderTable(this.document);
    context.passiveEffectsTable = await this.#passiveEffectsTable.renderTable(
      this.document
    );
    context.inactiveEffectsTable = await this.#inactiveEffectsTable.renderTable(
      this.document
    );

    context.className = this.actor.itemTypes?.class?.[0]?.name ?? '';
    context.archetypeName = this.actor.itemTypes?.archetype?.[0]?.name ?? '';
    context.subtypeName = this.actor.itemTypes?.subtype?.[0]?.name ?? '';

    const merit = actorData.meritProgress;
    const isTransform = merit?.mode === 'transform';
    context.canAdvance = merit?.canAdvance ?? false;
    context.advanceTooltip = game.i18n.localize(
      isTransform ? 'DASU.Actor.Merit.Transform' : 'DASU.Actor.Merit.LevelUp'
    );
    if (merit?.atMax) {
      context.meritTooltip = game.i18n.localize('DASU.Actor.Merit.AtMax');
    } else if (isTransform) {
      context.meritTooltip = game.i18n.format('DASU.Actor.Merit.ToTransform', {
        count: merit?.toNext ?? 0,
      });
    } else {
      context.meritTooltip = game.i18n.format('DASU.Actor.Merit.ToNext', {
        count: merit?.toNext ?? 0,
        level: merit?.nextLevel ?? actorData.level + 1,
      });
    }

    return context;
  }

  _prepareItems(context) {
    for (const i of context.items) {
      i.img = i.img || Item.DEFAULT_ICON;
    }
  }

  /** @override */
  static TRIAD_SUGGESTION_KEYS = {
    'dasu-virtues': 'DASU.Actor.Triad.VirtueSuggestions',
    'dasu-sins': 'DASU.Actor.Triad.SinSuggestions',
    'dasu-anathemas': 'DASU.Actor.Triad.AnathemaSuggestions',
  };

  #bindTriadComboboxes() {
    for (const input of this.element.querySelectorAll(
      '.dasu-triad__input[data-suggestions]'
    )) {
      const key = input.dataset.suggestions;
      const i18nKey = DASUActorSheet.TRIAD_SUGGESTION_KEYS[key];
      const raw = i18nKey ? game.i18n.localize(i18nKey) : '';
      const suggestions = raw ? raw.split(',') : [];
      input.addEventListener('focus', () =>
        this.#openTriadDropdown(input, suggestions)
      );
      input.addEventListener('input', () =>
        this.#openTriadDropdown(input, suggestions)
      );
      input.addEventListener('blur', (e) => {
        if (e.relatedTarget?.classList.contains('dasu-triad__input')) return;
        setTimeout(() => this.#closeTriadDropdown(), 120);
      });
    }
  }

  #openTriadDropdown(input, suggestions) {
    this.#closeTriadDropdown();
    const q = input.value.trim().toLowerCase();
    const filtered = q
      ? suggestions.filter((s) => s.toLowerCase().includes(q))
      : suggestions;
    if (!filtered.length) return;

    // Use the input's document so this works in a popped-out window.
    const doc = input.ownerDocument;
    const rect = input.getBoundingClientRect();
    const menu = doc.createElement('div');
    menu.className = 'dasu-triad-dropdown';
    menu.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.bottom}px;width:${rect.width}px;z-index:99999`;

    for (const val of filtered) {
      const item = doc.createElement('div');
      item.className = 'dasu-triad-option';
      item.textContent = val;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        input.value = val;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        this.#closeTriadDropdown();
      });
      menu.appendChild(item);
    }

    doc.body.appendChild(menu);
    this._triadDropdown = menu;
  }

  #closeTriadDropdown() {
    this._triadDropdown?.remove();
    this._triadDropdown = null;
  }

  async _onClose(options) {
    this.#closeTriadDropdown();
    return super._onClose(options);
  }

  _renderModeToggle() {
    const header = this.element.querySelector('.window-header');
    if (!header) return;
    let toggle = header.querySelector('.dasu-mode-toggle');
    if (this.isEditable && !toggle) {
      toggle = document.createElement('label');
      toggle.className = 'dasu-mode-toggle';
      toggle.dataset.tooltip = game.i18n.localize('DASU.Sheet.EditModeToggle');
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
              'input:not([type="hidden"]):not(.dasu-mode-checkbox), select:not(.actor-header__resistance-select)'
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
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.element.addEventListener('auxclick', (e) => {
      if (e.button !== 1) return;
      const row = e.target.closest('.dasu-table__row-container[data-key]');
      if (!row) return;
      e.preventDefault();
      const uuid = row.dataset.uuid ?? row.dataset.key;
      const doc = fromUuidSync(uuid);
      doc?.sheet?.render(true);
    });
    this.#bindPlannerSlots();
    this.#weaponTable.activateListeners(this);
    this.#abilityTable.activateListeners(this);
    this.#tacticTable.activateListeners(this);
    this.#schemaTable.activateListeners(this);
    this.#classTable.activateListeners(this);
    this.#archetypeTable.activateListeners(this);
    this.#subtypeTable.activateListeners(this);
    this.#itemTable.activateListeners(this);
    this.#featureTable.activateListeners(this);
    for (const { renderer } of DASUActorSheet.#moduleTableRegistry) {
      renderer.activateListeners(this);
    }
    this.#temporaryEffectsTable.activateListeners(this);
    this.#passiveEffectsTable.activateListeners(this);
    this.#inactiveEffectsTable.activateListeners(this);
    if (this.actor.type === 'summoner') {
      this.#bondTable.activateListeners(this);
      this.#activeStockTable.activateListeners(this);
      this.#inactiveStockTable.activateListeners(this);
      for (const tables of this.#daemonTableCache.values())
        tables.activateListeners(this);
    }
  }

  #bindTabBarDrag() {
    for (const bar of this.element.querySelectorAll('.dasu-fieldset__tabs')) {
      bar.addEventListener('contextmenu', (e) => {
        const tab = e.target.closest('.dasu-fieldset__tab[data-panel]');
        if (!tab) return;
        const panel = tab.dataset.panel;
        const uuid = panel.startsWith('ack-') ? panel.slice(4) : panel;
        const actor = fromUuidSync(uuid);
        if (!actor) return;
        e.preventDefault();
        actor.sheet?.render(true);
      });

      bar.addEventListener('wheel', (e) => {
        if (e.deltaY === 0) return;
        e.preventDefault();
        bar.scrollLeft += e.deltaY;
      }, { passive: false });

      bar.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const startX = e.clientX;
        const startScroll = bar.scrollLeft;
        let dragging = false;

        const onMove = (me) => {
          const dx = startX - me.clientX;
          if (!dragging && Math.abs(dx) > 8) {
            dragging = true;
            bar.dataset.dragging = '1';
          }
          if (dragging) bar.scrollLeft = startScroll + dx;
        };

        const onUp = () => {
          bar.ownerDocument.removeEventListener('mousemove', onMove);
          bar.ownerDocument.removeEventListener('mouseup', onUp);
          setTimeout(() => bar.removeAttribute('data-dragging'), 0);
        };

        bar.ownerDocument.addEventListener('mousemove', onMove);
        bar.ownerDocument.addEventListener('mouseup', onUp);
      });
    }
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);

    for (const { tab, html } of context.moduleItemTables ?? []) {
      const container = tab === 'items'
        ? this.element.querySelector('[data-application-part="items"] [data-panel="innate"]')
        : this.element.querySelector(`[data-application-part="${tab}"]`);
      if (!container) continue;
      const wrapper = document.createElement('div');
      wrapper.innerHTML = html;
      container.append(...wrapper.children);
    }

    this._renderModeToggle();
    this.#bindTabBarDrag();
    this.#bindTriadComboboxes();

    this.element.querySelectorAll('.actor-aptitudes__pill').forEach((pill) =>
      pill.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.#cycleAptitude(pill, 0);
      })
    );
    this.element.classList.toggle('edit-mode', this.isEditMode);
    this.element
      .querySelectorAll(
        'input:not([type="hidden"]):not(.dasu-mode-checkbox):not(.dasu-triad__input), select:not(.actor-header__resistance-select)'
      )
      .forEach((el) => el.toggleAttribute('readonly', !this.isEditMode));

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

    this.element.addEventListener(
      'wheel',
      (e) => {
        if (this._wheelPending || !this.isEditMode) return;
        const target = e.target;
        const delta = e.deltaY < 0 ? 1 : -1;

        const aptPill = target.closest('.actor-aptitudes__pill');
        if (aptPill?.dataset.aptitude) {
          e.preventDefault();
          this._wheelPending = true;
          setTimeout(() => {
            this._wheelPending = false;
          }, 300);
          this.#cycleAptitude(aptPill, delta);
          return;
        }

        const attrKey =
          target.name?.match(/^system\.attributes\.(\w+)\.value$/)?.[1] ??
          (target.matches('.attribute-controls .actor-sidebar__attr-value')
            ? target.closest('[data-attribute]')?.dataset.attribute
            : null);

        if (
          attrKey &&
          (target.matches('input[data-dtype="Number"]')
            ? !target.readOnly
            : true)
        ) {
          e.preventDefault();
          this._wheelPending = true;
          setTimeout(() => {
            this._wheelPending = false;
          }, 300);
          const current = this.actor.system.attributes[attrKey]?.value ?? 1;
          DASUActorSheet.#applyAttributeDelta(
            this.actor,
            attrKey,
            current,
            delta
          );
          return;
        }

        if (target.matches('input[data-dtype="Number"]') && !target.readOnly) {
          e.preventDefault();
          this._wheelPending = true;
          setTimeout(() => {
            this._wheelPending = false;
          }, 300);
          const current = parseInt(target.value) || 0;
          target.value = current + delta;
          target.dispatchEvent(new Event('change', { bubbles: true }));
        }
      },
      { passive: false }
    );

    for (const input of this.element.querySelectorAll(
      'input.actor-sidebar__attr-value'
    )) {
      input.addEventListener(
        'change',
        (e) => {
          const key = input.name?.match(
            /^system\.attributes\.(\w+)\.value$/
          )?.[1];
          if (!key) return;
          const next = parseInt(input.value) || 1;
          const prev = this.actor.system.attributes[key]?.value ?? 1;
          if (next <= prev) return;
          const warn = DASUActorSheet.#canRaiseAttribute(
            this.actor.system.attributes,
            this.actor.system.ap,
            key,
            next
          );
          if (warn) {
            DASUActorSheet.#warnAttribute(warn, next);
            e.stopImmediatePropagation();
            input.value = prev;
          }
        },
        { capture: true }
      );
    }

    for (const input of this.element.querySelectorAll(
      'input.actor-sidebar__skill-value'
    )) {
      input.addEventListener(
        'change',
        (e) => {
          const key = input.name?.match(/^system\.skills\.(\w+)\.value$/)?.[1];
          if (!key) return;
          const prev = this.actor.system.skills[key]?.value ?? 0;
          const next = Math.max(0, Math.min(6, parseInt(input.value) || 0));
          const delta = next - prev;
          if (delta === 0) {
            input.value = prev;
            return;
          }
          e.stopImmediatePropagation();
          input.value = prev;
          DASUActorSheet.#applySkillDelta(this.actor, key, prev, delta);
        },
        { capture: true }
      );
    }

    for (const row of this.element.querySelectorAll(
      '.actor-sidebar__skill-row'
    )) {
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const key = row.dataset.skill;
        const isCustom = !(key in CONFIG.DASU.skills);
        const items = [
          {
            label: game.i18n.localize('DASU.Sheet.EditItem'),
            icon: 'fas fa-pen',
            onClick: () => {},
          },
        ];
        if (isCustom)
          items.push({
            label: game.i18n.localize('DASU.Sheet.DeleteItem'),
            icon: 'fas fa-trash',
            onClick: () => {
              const raw = this.actor.toObject().system.skills ?? {};
              delete raw[key];
              this.actor.update(
                { 'system.skills': raw },
                { diff: false, recursive: false }
              );
            },
          });
        ui.context?.close();
        const menu = new foundry.applications.ux.ContextMenu(
          document.body,
          '#_dasu_nomatch_',
          items,
          { jQuery: false, fixed: true, relative: 'target' }
        );
        setTimeout(() => {
          ui.context = menu;
          menu.render(row, { event: e });
        }, 0);
      });
    }
  }

  /** @override */
  async _onDropActor(event, actorData) {
    if (this.actor.type !== 'summoner') return super._onDropActor(event, actorData);
    const dropped = await fromUuid(actorData.uuid);
    if (!dropped || dropped.type !== 'daemon') return false;
    const stock = foundry.utils.deepClone(this.actor.system.stock ?? []);
    if (stock.some((e) => e.uuid === actorData.uuid)) {
      ui.notifications?.warn(game.i18n.localize('DASU.Stock.AlreadyAdded'));
      return false;
    }
    stock.push({ uuid: actorData.uuid, active: false });
    await this.actor.update({ 'system.stock': stock });
    return true;
  }

  /** @override */
  async _onDropItem(event, item) {
    if (item?.type === 'bond' && this.actor.type !== 'summoner') {
      ui.notifications?.warn(game.i18n.localize('DASU.Bond.SummonerOnly'));
      return false;
    }
    if (item?.type === 'class' && this.actor.itemTypes.class.length > 0) {
      ui.notifications?.warn(game.i18n.localize('DASU.Item.Class.OnlyOne'));
      return false;
    }
    if (
      (item?.type === 'subtype' || item?.type === 'archetype') &&
      (this.actor.itemTypes[item.type]?.length ?? 0) > 0
    ) {
      ui.notifications?.warn(
        game.i18n.localize(`DASU.${item.type.capitalize()}.OnlyOne`)
      );
      return false;
    }
    if (
      (item?.type === 'ability' || item?.type === 'tactic') &&
      !this.#canAddSlotItem(item.type)
    ) {
      return false;
    }
    return super._onDropItem(event, item);
  }

  /**
   * Whether the daemon's subtype permits adding another ability/tactic. Warns
   * and returns false when the slot cap is reached.
   * @param {"ability"|"tactic"} type
   * @returns {boolean}
   */
  #canAddSlotItem(type) {
    const slot = this.actor.system.slots?.[type];
    if (!slot || slot.max == null) return true; // no subtype, no cap
    if (slot.used >= slot.max) {
      ui.notifications?.warn(
        game.i18n.format('DASU.Subtype.SlotsFull', {
          type: game.i18n.localize(`TYPES.Item.${type}`),
          max: slot.max,
        })
      );
      return false;
    }
    return true;
  }

  static #onRoll(event, target) {
    if (this.isEditMode) return;
    event.preventDefault();
    const dataset = target.dataset;
    if (dataset.rollType === 'item') {
      const item = this.actor.items.get(target.closest('.item').dataset.itemId);
      if (item) return item.roll();
    }
    if (dataset.roll) {
      const label = dataset.label
        ? `${game.i18n.localize('DASU.Sheet.RollFlavorAbility')} ${
            dataset.label
          }`
        : '';
      const roll = new Roll(dataset.roll, this.actor.getRollData());
      roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: label,
        rollMode: game.settings.get('core', 'rollMode'),
      });
      return roll;
    }
  }

  static #onRollAttribute(event, target) {
    if (this.isEditMode) return;
    const key = target.dataset.attribute;
    if (key) DASURollDialog.openAttribute(this.actor, key);
  }

  static #onRollSkill(event, target) {
    if (this.isEditMode) return;
    const key = target.dataset.skill;
    if (key) DASURollDialog.openSkill(this.actor, key);
  }

  static async #onOpenResourcePopover(event, target) {
    // Use the sheet's document so this works in a popped-out window.
    const doc = this.element.ownerDocument;
    const { resource } = target.dataset;
    const popId = `dasu-popover-${resource}`;
    const existing = doc.getElementById(popId);
    if (existing) {
      existing.remove();
      target.classList.remove('popover-open');
      return;
    }

    const isHp = resource === 'health';
    const val = this.actor.system.resources[isHp ? 'hp' : 'wp'];

    const html = await foundry.applications.handlebars.renderTemplate(
      'systems/dasu/templates/actor/parts/resource-popover.hbs',
      {
        value: val.value,
        max: val.max,
        label: game.i18n.localize(
          isHp ? 'DASU.Actor.HP.abbr' : 'DASU.Actor.WP.abbr'
        ),
        labelClass: isHp
          ? 'resource-popover__label--hp'
          : 'resource-popover__label--wp',
      }
    );
    const pop = Object.assign(doc.createElement('div'), {
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
      const v = int('.resource-popover__value');
      const m = int('.resource-popover__max');
      if (target.querySelector('.actor-sidebar__resource-val'))
        target.querySelector('.actor-sidebar__resource-val').textContent = v;
      if (target.querySelector('.actor-sidebar__resource-max'))
        target.querySelector('.actor-sidebar__resource-max').textContent = m;
      const fill = target.querySelector('.actor-sidebar__resource-fill');
      if (fill)
        fill.style.width = `${m > 0 ? Math.min(100, (v / m) * 100) : 0}%`;
    };
    const resourcePath = `system.resources.${isHp ? 'hp' : 'wp'}.value`;
    const update = (v) => {
      syncSidebar();
      return this.actor.update({ [resourcePath]: v }, { render: false });
    };

    pop.querySelectorAll('.resource-popover__btn').forEach((btn) =>
      btn.addEventListener('click', () => {
        const next = Math.min(
          int('.resource-popover__max'),
          Math.max(
            0,
            int('.resource-popover__value') +
              int('.resource-popover__delta') * parseInt(btn.dataset.step)
          )
        );
        pop.querySelector('.resource-popover__value').value = next;
        update(next);
      })
    );
    pop
      .querySelector('.resource-popover__value')
      .addEventListener('change', (e) => update(parseInt(e.target.value) || 0));
    pop.querySelectorAll('input').forEach((input) =>
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        }
      })
    );

    const close = async (e) => {
      if (!pop.contains(e.target) && e.target !== target) {
        // Commit the field; pointerdown removes the popover before blur fires.
        doc.removeEventListener('pointerdown', close);
        target.classList.remove('popover-open');
        await update(int('.resource-popover__value'));
        pop.remove();
        this.render();
      }
    };
    setTimeout(() => doc.addEventListener('pointerdown', close), 0);
  }

  static async #onOpenMeritPopover(event, target) {
    const doc = this.element.ownerDocument;
    const popId = 'dasu-popover-merit';
    const existing = doc.getElementById(popId);
    if (existing) {
      existing.remove();
      target.classList.remove('popover-open');
      return;
    }

    const currentMerit = this.actor.system.merit;
    const nextThreshold = this.actor.system.meritProgress?.needed ?? '-';
    const html = await foundry.applications.handlebars.renderTemplate(
      'systems/dasu/templates/actor/parts/merit-popover.hbs',
      {
        value: currentMerit,
        label: game.i18n.localize('DASU.Actor.Merit.long'),
        nextThreshold,
      }
    );
    const pop = Object.assign(doc.createElement('div'), {
      id: popId,
      className: 'dasu-resource-popover',
      innerHTML: html,
    });

    const anchor = this.element;
    const aRect = anchor.getBoundingClientRect();
    const rRect = target.getBoundingClientRect();
    const popWidth = 160;
    const leftRaw = rRect.right - aRect.left + anchor.scrollLeft - popWidth;
    Object.assign(pop.style, {
      top: `${rRect.bottom - aRect.top + anchor.scrollTop + 2}px`,
      left: `${Math.max(0, leftRaw)}px`,
      width: `${popWidth}px`,
    });
    anchor.appendChild(pop);
    target.classList.add('popover-open');

    const int = (sel) => parseInt(pop.querySelector(sel)?.value) || 0;
    const syncHeader = () => {
      const v = int('.resource-popover__value');
      const el = target.querySelector('.dasu-pill');
      if (el) el.value = v;
    };
    const update = (v) => {
      syncHeader();
      return this.actor.update(
        { 'system.merit': Math.max(0, v) },
        { render: false }
      );
    };

    pop.querySelectorAll('.resource-popover__btn').forEach((btn) =>
      btn.addEventListener('click', () => {
        const next = Math.max(
          0,
          int('.resource-popover__value') +
            int('.resource-popover__delta') * parseInt(btn.dataset.step)
        );
        pop.querySelector('.resource-popover__value').value = next;
        update(next);
      })
    );
    pop
      .querySelector('.resource-popover__value')
      .addEventListener('change', (e) => update(parseInt(e.target.value) || 0));
    pop.querySelectorAll('input').forEach((input) =>
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        }
      })
    );

    const close = async (e) => {
      if (!pop.contains(e.target) && e.target !== target) {
        doc.removeEventListener('pointerdown', close);
        target.classList.remove('popover-open');
        await update(int('.resource-popover__value'));
        pop.remove();
        this.render();
      }
    };
    setTimeout(() => doc.addEventListener('pointerdown', close), 0);
  }

  static #onResourceStep(event, target) {
    const resource = target.dataset.resource;
    const isHp = resource === 'health';
    const sign = parseInt(target.dataset.step);
    const deltaInput = target
      .closest('.resource-popover__stepper')
      .querySelector('.resource-popover__delta');
    const delta = (parseInt(deltaInput?.value) || 1) * sign;
    const res = this.actor.system.resources[isHp ? 'hp' : 'wp'];
    const current = res?.value ?? 0;
    const max = res?.max ?? current;
    this.actor.update({
      [`system.resources.${isHp ? 'hp' : 'wp'}.value`]: Math.min(
        max,
        Math.max(0, current + delta)
      ),
    });
  }

  #preparePlanner(actor) {
    const cls = actor.itemTypes?.class?.[0] ?? null;
    const merits = CONFIG.DASU.levelMerits ?? {};
    const currentLevel = actor.system.level ?? 1;

    const byLevel = new Map();
    if (cls) {
      for (const adv of cls.system.advancements ?? []) {
        if (!byLevel.has(adv.level)) byLevel.set(adv.level, []);
        byLevel.get(adv.level).push(adv);
      }
    }

    const meritMax = Object.keys(merits).reduce(
      (m, k) => Math.max(m, Number(k)),
      0
    );
    const advMax = byLevel.size ? Math.max(...byLevel.keys()) : 0;
    const maxLevel = Math.max(meritMax, advMax, currentLevel + 5, 1);

    const rows = [];
    for (let level = 1; level <= maxLevel; level++) {
      const advs = byLevel.get(level) ?? [];

      let aptitudeUp = 0;
      const schema = [];
      const itemGrants = [];
      for (const a of advs) {
        for (const entry of a.getPlannerEntries(actor, {
          level,
          currentLevel,
        })) {
          if (entry.kind === 'apt') aptitudeUp += entry.amount ?? 1;
          else if (entry.kind === 'schema') schema.push(entry.label);
          else if (entry.kind === 'item-fixed') {
            itemGrants.push({ fixed: true, fixedName: entry.label });
          } else if (entry.kind === 'slot') {
            itemGrants.push({
              fixed: false,
              advancementId: entry.advancementId,
              type: entry.accentType,
              typeLabel: entry.typeLabel,
              itemType: entry.itemType,
              filled: entry.filled,
              filledName: entry.filledName,
            });
          }
        }
      }
      rows.push({
        level,
        isCurrent: level === currentLevel,
        isReached: level <= currentLevel,
        meritText: merits[level] ?? '–',
        spText: cls ? cls.system.spMax(level) : '–',
        apText: cls ? cls.system.apMax(level) : '–',
        aptitudeUp,
        schema,
        itemGrants,
        empty: !aptitudeUp && !schema.length && !itemGrants.length,
      });
    }

    const reachedRows = rows.filter((r) => r.isReached);
    return {
      reachedRows,
      futureRows: rows.filter((r) => !r.isReached),
      hasClass: !!cls,
      className: cls?.name ?? '',
      aptitudeMax: reachedRows.reduce((sum, r) => sum + r.aptitudeUp, 0),
    };
  }

  #slotAdvancement(advancementId) {
    const cls = this.actor.itemTypes?.class?.[0];
    const adv = cls?.system.advancements.get(advancementId);
    return adv?.isFillSlot ? adv : null;
  }

  static async #onPlannerUnslot(event, target) {
    const adv = this.#slotAdvancement(target.dataset.advancementId);
    await adv?.clearFromActor(this.actor);
  }

  static async #onPlannerOpenItem(event, target) {
    if (event.target.closest('.planner__slot-clear')) return;
    const adv = this.#slotAdvancement(target.dataset.advancementId);
    if (!adv) return;
    const choice = adv.getChoice(this.actor);
    if (!choice) return;
    const item = choice.itemId
      ? this.actor.items.get(choice.itemId)
      : choice.sourceUuid
      ? await fromUuid(choice.sourceUuid)
      : null;
    item?.sheet?.render(true);
  }

  static #onPlannerEditClass() {
    const cls = this.actor.itemTypes?.class?.[0];
    cls?.sheet?.render(true);
  }

  #bindPlannerSlots() {
    this.element.addEventListener('dragover', (e) => {
      const slot = e.target.closest('.planner__slot--fillable');
      if (!slot) return;
      e.preventDefault();
      slot.classList.add('drag-over');
    });
    this.element.addEventListener('dragleave', (e) => {
      const slot = e.target.closest('.planner__slot--fillable');
      if (slot && !slot.contains(e.relatedTarget)) {
        slot.classList.remove('drag-over');
      }
    });
    this.element.addEventListener(
      'drop',
      async (e) => {
        const slot = e.target.closest('.planner__slot--fillable');
        if (!slot) return;
        e.preventDefault();
        e.stopPropagation();
        slot.classList.remove('drag-over');
        let data;
        try {
          data = JSON.parse(e.dataTransfer.getData('text/plain'));
        } catch {
          return;
        }
        if (data.type !== 'Item' || !data.uuid) return;
        const adv = this.#slotAdvancement(slot.dataset.advancementId);
        await adv?.slot(this.actor, data.uuid);
      },
      true
    );
  }

  static #onAdvance(event, target) {
    event.preventDefault();
    const merit = this.actor.system.meritProgress;
    if (!merit?.canAdvance) return;
    if (merit.mode === 'transform') {
      // Daemon Transformation: per-entry effects not yet wired up.
      ui.notifications.info(
        game.i18n.localize('DASU.Actor.Merit.TransformReady')
      );
      return;
    }
    this.actor.update({ 'system.level': this.actor.system.level + 1 });
  }

  static #canRaiseAttribute(attributes, ap, key, next) {
    if (next > 6) return 'DASU.Sheet.Warn.AttrCapped';
    if (next < 1) return null;
    if (ap?.value <= 0) return 'DASU.Sheet.Warn.NoAP';
    if (next >= 3) {
      const others = Object.entries(attributes).filter(([k]) => k !== key);
      if (others.filter(([, a]) => a.value >= next - 1).length < 1)
        return 'DASU.Sheet.Warn.RuleOfTwo';
    }
    return null;
  }

  static #warnAttribute(reason, next) {
    if (!reason) return;
    const msg =
      reason === 'DASU.Sheet.Warn.RuleOfTwo'
        ? game.i18n.format(reason, { value: next - 1 })
        : game.i18n.localize(reason);
    ui.notifications.warn(msg);
  }

  static #applyAttributeDelta(actor, key, current, delta) {
    const next = current + delta;
    if (delta < 0 && next < 1) return;
    if (delta > 0) {
      const warn = DASUActorSheet.#canRaiseAttribute(
        actor.system.attributes,
        actor.system.ap,
        key,
        next
      );
      if (warn) {
        DASUActorSheet.#warnAttribute(warn, next);
        return;
      }
    }
    actor.update({ [`system.attributes.${key}.value`]: next });
  }

  static #canRaiseSkill(skills, sp, key, next) {
    if (next > 6) return 'DASU.Sheet.Warn.SkillCapped';
    if (next < 0) return null;
    const triCost = (r) => (r * (r + 1)) / 2;
    const current = skills[key]?.value ?? 0;
    const cost = triCost(next) - triCost(current);
    if (sp?.value < cost) return 'DASU.Sheet.Warn.NoSP';
    return null;
  }

  static #applySkillDelta(actor, key, current, delta) {
    const next = current + delta;
    if (delta < 0 && next < 0) return;
    if (delta > 0 && next > 6) return;
    if (delta > 0) {
      const warn = DASUActorSheet.#canRaiseSkill(
        actor.system.skills,
        actor.system.sp,
        key,
        next
      );
      if (warn) {
        ui.notifications.warn(game.i18n.localize(warn));
        return;
      }
    }
    actor.update({ [`system.skills.${key}.value`]: next });
  }

  static #onSkillStep(event, target) {
    const { skill, step } = target.dataset;
    const current = this.actor.system.skills[skill]?.value ?? 0;
    DASUActorSheet.#applySkillDelta(this.actor, skill, current, parseInt(step));
  }

  // Steps a base aptitude's rank, clamped to 0–4, enforcing the tier
  // prerequisite: a Lvl 3 requires two aptitudes at Lvl 2+, a Lvl 4 requires
  // two at Lvl 3+ (the aptitude being raised counts toward its own requirement).
  #cycleAptitude(target, dir) {
    if (!this.isEditMode) return;
    const { aptitude } = target.dataset;
    if (!aptitude) return;

    // Derived aptitudes (DA/TA/TG/assist) are computed, not directly set.
    if (aptitude in (DASU.derivedAptitudes ?? {})) return;

    const apts = this.actor.system.aptitudes;
    const current = apts[aptitude]?.bonus ?? 0;
    const next = dir === 0 ? 0 : Math.max(0, Math.min(4, current + dir));
    if (next === current) return;

    if (next > current && next >= 3) {
      const requiredTier = next - 1; // L3 needs two at L2+, L4 needs two at L3+
      let count = 0;
      for (const key of Object.keys(DASU.aptitudes)) {
        if (key in (DASU.derivedAptitudes ?? {})) continue;
        const v = key === aptitude ? next : apts[key]?.bonus ?? 0;
        if (v >= requiredTier) count++;
      }
      if (count < 2) {
        ui.notifications?.warn(
          game.i18n.format('DASU.Aptitude.PrereqWarning', {
            tier: next,
            requiredTier,
          })
        );
        return;
      }
    }

    this.actor.update({ [`system.aptitudes.${aptitude}.bonus`]: next });
  }

  static #onAptitudeStep(event, target) {
    this.#cycleAptitude(target, 1);
  }

  static #onCreateCustomSkill() {
    if (!this.isEditMode) return;
    const id = foundry.utils.randomID(8);
    this.actor.update({
      [`system.skills.${id}`]: { value: 0, customName: '' },
    });
  }

  static #onDeleteCustomSkill(event, target) {
    const { id } = target.dataset;
    const skills = this.actor.toObject().system.skills ?? {};
    delete skills[id];
    this.actor.update(
      { 'system.skills': skills },
      { diff: false, recursive: false }
    );
  }

  static async #onShowResistance(event, target) {
    const key = target.dataset.resistance;
    if (!key) return;
    const actor = this.actor;
    const base = actor.system.resistances?.[key]?.base ?? 0;
    const ABBR = { '-1': 'WK', 0: '–', 1: 'RS', 2: 'NU', 3: 'DR' };
    const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const typeLabel = game.i18n.localize(`DASU.DamageType.${capitalize(key)}`);
    const levelKey = { '-1': 'Weak', 0: 'Normal', 1: 'Resist', 2: 'Nullify', 3: 'Drain' }[String(base)];
    const levelLabel = game.i18n.localize(`DASU.Resistance.${levelKey}`);
    const abbr = ABBR[String(base)] ?? '–';
    const resistImg = `systems/dasu/assets/resistances/${key}.png`;

    const sectionHtml = await foundry.applications.handlebars.renderTemplate(
      `systems/${SYSTEM}/templates/chat/chat-resistance.hbs`,
      { resistImg, typeLabel, levelLabel, abbr }
    );

    const content = await foundry.applications.handlebars.renderTemplate(
      `systems/${SYSTEM}/templates/chat/chat-check.hbs`,
      { checkTitle: typeLabel, checkLabel: null, checkType: 'display', sections: [sectionHtml], tags: [] }
    );

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
      flags: {
        [SYSTEM]: {
          [Flags.ChatMessage.Check]: { type: 'display', additionalData: { resistanceImg: resistImg } },
        },
      },
    });
  }

  static async #onFieldsetTab(event, target) {
    await this.#fieldsets.onTab(event, target, this.document);
  }

  static async #onFieldsetSplit(event, target) {
    await this.#fieldsets.onSplit(event, target, this.document);
  }
}
