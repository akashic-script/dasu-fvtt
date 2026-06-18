const { HandlebarsApplicationMixin } = foundry.applications.api;
const { DocumentSheetV2 } = foundry.applications.api;
import { prepareActiveEffectCategories } from '../helpers/effects.mjs';
import { DASU } from '../helpers/config.mjs';
import { SheetLayoutMixin } from './mixins/sheet-layout-mixin.mjs';
import { EffectTableRenderer } from '../helpers/tables/effect-table-renderer.mjs';

/**
 * Extend the basic ItemSheet with some very simple modifications
 * @extends {DocumentSheetV2}
 * @mixes {HandlebarsApplication}
 */
export class DASUItemSheet extends SheetLayoutMixin(
  HandlebarsApplicationMixin(DocumentSheetV2)
) {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ['dasu', 'sheet', 'item'],
    position: { width: 565, height: 520 },
    window: { resizable: true },
    form: {
      submitOnChange: true,
    },
    actions: {
      addItemEffect: DASUItemSheet.#onAddItemEffect,
      deleteItemEffect: DASUItemSheet.#onDeleteItemEffect,
      clearGrantUuid: DASUItemSheet.#onClearGrantUuid,
      fieldsetTab: DASUItemSheet.#onFieldsetTab,
      fieldsetSplit: DASUItemSheet.#onFieldsetSplit,
    },
  };

  /** @override */
  static TABS = {
    primary: {
      tabs: [
        {
          id: 'description',
          label: 'DASU.Sheet.Tab.Description',
          icon: 'fas fa-feather',
        },
        {
          id: 'advanced',
          label: 'DASU.Sheet.Tab.Advanced',
          icon: 'fas fa-sliders',
        },
        { id: 'effects', label: 'DASU.Sheet.Tab.Effects', icon: 'fas fa-bolt' },
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
    advanced: {
      template: 'systems/dasu/templates/item/parts/advanced.hbs',
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

  #temporaryEffectsTable = new EffectTableRenderer(
    'temporary',
    'DASU.Effect.Temporary',
    (doc) => prepareActiveEffectCategories(doc.effects).temporary.effects
  );
  #passiveEffectsTable = new EffectTableRenderer(
    'passive',
    'DASU.Effect.Passive',
    (doc) => prepareActiveEffectCategories(doc.effects).passive.effects
  );
  #inactiveEffectsTable = new EffectTableRenderer(
    'inactive',
    'DASU.Effect.Inactive',
    (doc) => prepareActiveEffectCategories(doc.effects).inactive.effects
  );

  /** @override */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    if (this.document.type === 'schema') {
      parts.advanced = { template: 'systems/dasu/templates/item/parts/schema-advanced.hbs', scrollable: [''] };
    } else {
      delete parts.advanced;
    }
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
    context.isItem = item.type === 'item';
    context.isWeapon = item.type === 'weapon';
    context.isAbility = item.type === 'ability';
    context.isTactic = item.type === 'tactic';
    context.isSchema = item.type === 'schema';

    const localize = (obj) =>
      Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [k, game.i18n.localize(v)])
      );

    if (context.isItem) {
      context.resourceTypeOptions = localize(DASU.resourceTypes);
      context.resourceOptions = localize(DASU.itemResources);
      context.modeOptions = localize(DASU.itemEffectModes);
      context.statusModeOptions = localize(DASU.itemStatusModes);
      context.clearModeOptions = localize(DASU.itemClearModes);
      context.attributeOptions = localize(DASU.attributes);
      context.itemEffects = (itemData.system.effects ?? []).map((effect, i) => {
        const isStatus = effect.resource === 'status';
        const isClear = isStatus && effect.statusMode === 'clear';
        const isGrant = isStatus && effect.statusMode === 'grant';
        const isNumericTick = !isStatus && effect.mode === 'tick';
        let grantUuidName = '';
        if (isGrant && effect.grantUuid) {
          const doc = fromUuidSync(effect.grantUuid);
          grantUuidName = doc?.name ?? effect.grantUuid;
        }
        return {
          ...effect,
          index: i,
          showMode: !isStatus,
          showAttribute: isNumericTick,
          showStatusMode: isStatus,
          showClearMode: isClear,
          showStatusCount: isClear && effect.clearMode === 'choose',
          showGrantUuid: isGrant,
          grantUuidName,
        };
      });
    }

    if (context.isWeapon) {
      context.resourceTypeOptions = localize(DASU.resourceTypes);
      context.categoryOptions = localize(DASU.weaponCategories);
      context.rangeOptions = localize(DASU.weaponRanges);
      context.damageTypeOptions = localize(DASU.damageTypes);
    }

    if (context.isAbility) {
      const category = itemData.system.category;
      context.resourceTypeOptions = localize(DASU.resourceTypes);
      context.abilityCategoryOptions = localize(DASU.abilityCategories);
      context.aptitudeOptions = localize(DASU.aptitudes);
      context.damageTypeOptions = localize(DASU.damageTypes);
      context.resourceOptions = localize(DASU.abilityHealResources);
      context.modeOptions = localize(DASU.itemEffectModes);
      context.attributeOptions = localize(DASU.attributes);
      context.isSpellAbility = category === 'spell';
      context.isAfflictionAbility = category === 'affliction';
      context.isRestorativeAbility = category === 'restorative';
      context.isTechniqueAbility = category === 'technique';
      context.showAbilityDamage =
        context.isSpellAbility || context.isTechniqueAbility;
      context.showAbilityToHit =
        context.isSpellAbility ||
        context.isAfflictionAbility ||
        context.isTechniqueAbility;
    }

    if (context.isTactic) {
      context.governOptions = { none: game.i18n.localize("DASU.Item.Tactic.GovernNone"), ...localize(DASU.attributes) };
      context.resourceTypeOptions = localize(DASU.resourceTypes);
      context.damageTypeOptions = localize(DASU.damageTypes);
    }

    // Retrieve the roll data for TinyMCE editors.
    context.rollData = item.getRollData();

    if (context.isSchema) {
      context.resourceTypeOptions = localize(DASU.resourceTypes);
      const system = itemData.system;
      for (const key of ['level1', 'level2', 'level3']) {
        context[`${key}DescriptionHTML`] = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
          system[key]?.description ?? '',
          { relativeTo: item, secrets: item.isOwner, rollData: context.rollData }
        );
      }
    }

    context.descriptionHTML =
      await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        item.system.description ?? '',
        { relativeTo: item, secrets: item.isOwner, rollData: context.rollData }
      );

    context.temporaryEffectsTable =
      await this.#temporaryEffectsTable.renderTable(this.document);
    context.passiveEffectsTable = await this.#passiveEffectsTable.renderTable(
      this.document
    );
    context.inactiveEffectsTable = await this.#inactiveEffectsTable.renderTable(
      this.document
    );

    return context;
  }

  /* -------------------------------------------- */

  /** @override */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.#temporaryEffectsTable.activateListeners(this);
    this.#passiveEffectsTable.activateListeners(this);
    this.#inactiveEffectsTable.activateListeners(this);
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);

    for (const nameEl of this.element.querySelectorAll(
      '.effect-drop-zone__name[data-grant-uuid]'
    )) {
      nameEl.addEventListener('click', async () => {
        const uuid = nameEl.dataset.grantUuid;
        if (!uuid) return;
        const doc = await fromUuid(uuid);
        doc?.sheet?.render(true);
      });
    }

    for (const zone of this.element.querySelectorAll('.effect-drop-zone')) {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('drag-over');
      });
      zone.addEventListener('dragleave', () =>
        zone.classList.remove('drag-over')
      );
      zone.addEventListener('drop', async (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        let data;
        try {
          data = JSON.parse(e.dataTransfer.getData('text/plain'));
        } catch {
          return;
        }
        if (data.type !== 'ActiveEffect' || !data.uuid) return;
        const index = Number(zone.dataset.effectIndex);
        const effects = this.item.system.toObject().effects ?? [];
        if (!effects[index]) return;
        effects[index].grantUuid = data.uuid;
        await this.item.update({ 'system.effects': effects });
      });
    }

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

  static async #onAddItemEffect() {
    const effects = this.item.system.toObject().effects ?? [];
    effects.push({});
    await this.item.update({ 'system.effects': effects });
  }

  static async #onClearGrantUuid(event, target) {
    const index = Number(target.dataset.index);
    const effects = this.item.system.toObject().effects ?? [];
    if (!effects[index]) return;
    effects[index].grantUuid = null;
    await this.item.update({ 'system.effects': effects });
  }

  static async #onDeleteItemEffect(event, target) {
    const index = Number(target.dataset.index);
    const effects = this.item.system.toObject().effects ?? [];
    if (index < 0 || index >= effects.length) return;
    effects.splice(index, 1);
    await this.item.update({ 'system.effects': effects });
  }

  static #onFieldsetTab(event, target) {
    const fieldset = target.closest('.dasu-fieldset--tabbed');
    if (!fieldset) return;
    const panel = target.dataset.panel;
    fieldset.querySelectorAll('.dasu-fieldset__tab').forEach((t) => t.classList.remove('active'));
    fieldset.querySelectorAll('.dasu-fieldset__panel').forEach((p) => { p.hidden = true; });
    target.classList.add('active');
    fieldset.querySelector(`.dasu-fieldset__panel[data-panel="${panel}"]`).hidden = false;
  }

  static #onFieldsetSplit(event, target) {
    const fieldset = target.closest('.dasu-fieldset--tabbed');
    if (!fieldset) return;
    const direction = target.dataset.direction ?? 'row';
    const alreadyActive = target.classList.contains('active');
    fieldset.querySelectorAll('.dasu-fieldset__split-btn').forEach((btn) => btn.classList.remove('active'));
    if (alreadyActive) {
      fieldset.classList.remove('dasu-fieldset--split');
      const activeTab = fieldset.querySelector('.dasu-fieldset__tab.active');
      const activePanel = activeTab?.dataset.panel;
      fieldset.querySelectorAll('.dasu-fieldset__panel').forEach((p) => {
        p.hidden = p.dataset.panel !== activePanel;
      });
    } else {
      target.classList.add('active');
      fieldset.dataset.splitDirection = direction;
      fieldset.classList.add('dasu-fieldset--split');
      fieldset.querySelectorAll('.dasu-fieldset__panel').forEach((p) => { p.hidden = false; });
    }
  }
}
