const { HandlebarsApplicationMixin } = foundry.applications.api;
const { DocumentSheetV2 } = foundry.applications.api;
import { prepareActiveEffectCategories } from '../helpers/effects.mjs';
import { DASU, SYSTEM } from '../helpers/config.mjs';
import { SheetLayoutMixin } from './mixins/sheet-layout-mixin.mjs';
import { EffectTableRenderer } from '../helpers/tables/effect-table-renderer.mjs';
import { AdvancementTableRenderer } from '../helpers/tables/advancement-table-renderer.mjs';
import { FieldsetStateManager } from '../helpers/fieldset-state.mjs';

const BOND_RANK_KEYS = ['rank1', 'rank2', 'rank3'];

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
    dragDrop: [{ dragSelector: '[data-drag]', dropSelector: null }],
    actions: {
      addItemEffect: DASUItemSheet.#onAddItemEffect,
      deleteItemEffect: DASUItemSheet.#onDeleteItemEffect,
      clearGrantUuid: DASUItemSheet.#onClearGrantUuid,
      regenerateDsid: DASUItemSheet.#onRegenerateDsid,
      addArchetypeBonus: DASUItemSheet.#onAddArchetypeBonus,
      deleteArchetypeBonus: DASUItemSheet.#onDeleteArchetypeBonus,
      fieldsetTab: DASUItemSheet.#onFieldsetTab,
      fieldsetSplit: DASUItemSheet.#onFieldsetSplit,
    },
  };

  get _dragDrop() {
    return (this.#dragDrop ??= (this.options.dragDrop ?? []).map(
      (d) =>
        new foundry.applications.ux.DragDrop.implementation({
          ...d,
          permissions: {
            dragstart: () => this.isEditable,
            drop: () => this.isEditable,
          },
          callbacks: {
            drop: this._onDrop.bind(this),
          },
        })
    ));
  }

  #dragDrop = null;

  async _onDrop(event) {
    if (!this.isEditable || !this.item.isOwner) return;
    const zone = event.target.closest(
      '.ability-effect-drop-zone, section[data-tab="effects"]'
    );
    if (!zone) return;
    zone.classList.remove('drag-over');
    const data =
      foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (data?.type !== 'ActiveEffect' || !data.uuid) return;
    const src = await fromUuid(data.uuid);
    if (!src || src.parent === this.item) return;
    const effectData = src.toObject();
    delete effectData._id;
    if (zone.classList.contains('ability-effect-drop-zone')) {
      effectData.flags = effectData.flags ?? {};
      effectData.flags.dasu = {
        applyTarget: 'target',
        ...effectData.flags.dasu,
        applied: true,
      };
    }
    await this.item.createEmbeddedDocuments('ActiveEffect', [effectData]);
  }

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

  #advancementTable = null;

  #fieldsets = new FieldsetStateManager([
    {
      id: 'schema-levels',
      defaultPanel: 'level1',
      defaultSplit: true,
      defaultSplitDirection: 'column',
      panels: ['level1', 'level2', 'level3'],
    },
    {
      id: 'bond-ranks',
      defaultPanel: 'rank1',
      defaultSplitDirection: 'column',
      panels: ['rank1', 'rank2', 'rank3'],
    },
  ]);

  #ownEffects = (doc) =>
    doc.effects.filter((e) => !e.getFlag(SYSTEM, 'applied'));

  #temporaryEffectsTable = new EffectTableRenderer(
    'temporary',
    'DASU.Effect.Temporary',
    (doc) => prepareActiveEffectCategories(this.#ownEffects(doc)).temporary.effects
  );
  #passiveEffectsTable = new EffectTableRenderer(
    'passive',
    'DASU.Effect.Passive',
    (doc) => prepareActiveEffectCategories(this.#ownEffects(doc)).passive.effects
  );
  #inactiveEffectsTable = new EffectTableRenderer(
    'inactive',
    'DASU.Effect.Inactive',
    (doc) => prepareActiveEffectCategories(this.#ownEffects(doc)).inactive.effects
  );

  /** @override */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    if (this.document.type === 'schema') {
      parts.advanced = {
        template: 'systems/dasu/templates/item/parts/schema-advanced.hbs',
        scrollable: [''],
      };
    } else if (this.document.type === 'class') {
      parts.advanced = {
        template: 'systems/dasu/templates/item/parts/class-advancement.hbs',
        scrollable: [''],
      };
    } else if (this.document.type === 'dejection') {
      parts.advanced = {
        template: 'systems/dasu/templates/item/parts/dejection-advancement.hbs',
        scrollable: [''],
      };
    } else if (this.document.type === 'archetype') {
      parts.advanced = {
        template: 'systems/dasu/templates/item/parts/archetype-advanced.hbs',
        scrollable: [''],
      };
    } else if (this.document.type === 'bond') {
      parts.advanced = {
        template: 'systems/dasu/templates/item/parts/bond-advanced.hbs',
        scrollable: [''],
      };
    } else if (this.document.type === 'ability') {
      // Every ability sub-category gets the "Apply Effects" advanced tab.
      parts.advanced = {
        template: 'systems/dasu/templates/item/parts/ability-effects-advanced.hbs',
        scrollable: [''],
      };
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
    context.isClass = item.type === 'class';
    context.isArchetype = item.type === 'archetype';
    context.isSubtype = item.type === 'subtype';
    context.isBond = item.type === 'bond';
    context.isSpecialAbility = item.type === 'specialAbility';
    context.isSkillAbility = item.type === 'skillAbility';
    context.isScar = item.type === 'scar';
    context.isDejection = item.type === 'dejection';
    context.dejectionLevel = item.actor?.system?.dejection ?? 0;

    const localize = (obj) =>
      Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [k, game.i18n.localize(v)])
      );

    if (context.isItem) {
      context.itemCategoryOptions = localize(DASU.itemCategories);
      context.isFoodOfGods = itemData.system.category === 'foodOfGods';
      context.resourceTypeOptions = localize(DASU.resourceTypes);
      context.resourceOptions = localize(DASU.itemResources);
      context.modeOptions = localize(DASU.itemEffectModes);
      context.statusModeOptions = localize(DASU.itemStatusModes);
      context.clearModeOptions = localize(DASU.itemClearModes);
      context.attributeOptions = localize(DASU.attributes);
      context.damageTypeOptions = localize(DASU.damageTypes);
      context.itemEffects = (itemData.system.effects ?? []).map((effect, i) => {
        const isStatus = effect.resource === 'status';
        const isDamage = effect.resource === 'damage';
        const isClear = isStatus && effect.statusMode === 'clear';
        const isGrant = isStatus && effect.statusMode === 'grant';
        const isNumericTick = !isStatus && !isDamage && effect.mode === 'tick';
        let grantUuidName = '';
        if (isGrant && effect.grantUuid) {
          const doc = fromUuidSync(effect.grantUuid);
          grantUuidName = doc?.name ?? effect.grantUuid;
        }
        return {
          ...effect,
          index: i,
          showMode: !isStatus && !isDamage,
          showAttribute: isNumericTick,
          showStatusMode: isStatus,
          showClearMode: isClear,
          showStatusCount: isClear && effect.clearMode === 'choose',
          showDamage: isDamage,
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
      context.damageResourceOptions = localize(DASU.damageResources);
      context.governOptions = localize(DASU.attributes);
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
      context.governOptions = localize(DASU.attributes);
      context.damageResourceOptions = localize(DASU.damageResources);
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
      context.abilityEffects = item.effects
        .filter((e) => e.getFlag(SYSTEM, 'applied'))
        .map((e) => ({
          id: e.id,
          uuid: e.uuid,
          name: e.name,
          img: e.img,
          durationValue: e.duration?.value ?? null,
          durationUnits: e.duration?.units ?? 'turns',
          applyTarget: e.flags?.dasu?.applyTarget ?? 'target',
        }));
      context.durationUnitsOptions = {
        turns: game.i18n.localize('DASU.Duration.Turns'),
        rounds: game.i18n.localize('DASU.Duration.Rounds'),
      };
      context.applyTargetOptions = {
        target: game.i18n.localize('DASU.Item.Ability.ApplyTarget.Target'),
        self: game.i18n.localize('DASU.Item.Ability.ApplyTarget.Self'),
      };
    }

    if (context.isTactic) {
      context.governOptions = {
        none: game.i18n.localize('DASU.Item.Tactic.GovernNone'),
        ...localize(DASU.attributes),
      };
      context.resourceTypeOptions = localize(DASU.resourceTypes);
      context.damageTypeOptions = localize(DASU.damageTypes);
      context.damageResourceOptions = localize(DASU.damageResources);
    }

    // Retrieve the roll data for TinyMCE editors.
    context.rollData = item.getRollData();

    if (context.isSchema) {
      context.resourceTypeOptions = localize(DASU.resourceTypes);
      const system = itemData.system;
      for (const key of ['level1', 'level2', 'level3']) {
        context[`${key}DescriptionHTML`] =
          await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            system[key]?.description ?? '',
            {
              relativeTo: item,
              secrets: item.isOwner,
              rollData: context.rollData,
            }
          );
      }
    }

    if (context.isArchetype) {
      context.bonusTargetOptions = localize(DASU.archetypeBonusTargets);
    }

    if (context.isClass) {
      if (!this.#advancementTable) {
        this.#advancementTable = new AdvancementTableRenderer({
          editable: context.editable,
          item,
          allowedTypes: ['aptitude', 'schemaSlot', 'schemaUpgrade', 'itemGrant'],
        });
      }
      context.advancementTable = await this.#advancementTable.renderTable(item);
    }

    if (context.isDejection) {
      if (!this.#advancementTable) {
        this.#advancementTable = new AdvancementTableRenderer({
          editable: context.editable,
          item,
          levelLabel: 'DASU.Item.Class.Level',
          addTooltip: 'DASU.Dejection.Curse.Add',
          allowedTypes: ['relentlessCurse'],
        });
      }
      context.advancementTable = await this.#advancementTable.renderTable(item);
    }

    if (context.isSpecialAbility) {
      context.kindOptions = localize({
        passive: 'DASU.SpecialAbility.Kind.Passive',
        active: 'DASU.SpecialAbility.Kind.Active',
        reactive: 'DASU.SpecialAbility.Kind.Reactive',
      });
    }

    if (context.isSkillAbility) {
      context.skillOptions = {
        '': game.i18n.localize('DASU.SkillAbility.SkillAny'),
        ...localize(DASU.skills),
      };
      // When owned by an actor, also offer that actor's custom skills (stored by
      // random id), so an ability can be tied to a homebrew skill.
      const owner = item.parent instanceof Actor ? item.parent : null;
      for (const [key, s] of Object.entries(owner?.system?.skills ?? {})) {
        if (key in DASU.skills) continue;
        const label = s.customName?.trim() || s.label || key;
        if (label) context.skillOptions[key] = label;
      }
      // A saved skill id that no longer resolves still needs to display.
      if (item.system.skill && !(item.system.skill in context.skillOptions)) {
        context.skillOptions[item.system.skill] = item.system.skill;
      }
      context.thresholdTypeOptions = localize({
        avoid: 'DASU.SkillAbility.Threshold.Avoid',
        defense: 'DASU.SkillAbility.Threshold.Defense',
        fixed: 'DASU.SkillAbility.Threshold.Fixed',
      });
    }

    context.fieldsets = this.#fieldsets.prepareContext(item);

    if (context.isBond) {
      context.bondAbilityTypeOptions = localize({
        active: 'DASU.Bond.Ability.Active',
        passive: 'DASU.Bond.Ability.Passive',
        reactive: 'DASU.Bond.Ability.Reactive',
      });
      const targetUuid = itemData.system.targetUuid;
      let targetActor = null;
      if (targetUuid) {
        try {
          targetActor = await fromUuid(targetUuid);
        } catch {
          targetActor = null;
        }
      }
      context.bondTarget = targetUuid
        ? {
            uuid: targetUuid,
            name: targetActor?.name ?? itemData.system.targetName ?? targetUuid,
            img: targetActor?.img ?? null,
            missing: !targetActor,
          }
        : null;
      const panelState = context.fieldsets['bond-ranks']?.panels ?? {};
      const rankLabel = game.i18n.localize('DASU.Bond.RankName');
      context.bondRanks = await Promise.all(
        BOND_RANK_KEYS.map(async (key, i) => {
          const rank = itemData.system[key] ?? {};
          let effect = null;
          if (rank.effectUuid) {
            const doc = await fromUuid(rank.effectUuid);
            if (doc) {
              const description = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
                doc.description ?? '',
                { relativeTo: doc, secrets: false, rollData: context.rollData }
              );
              effect = { uuid: rank.effectUuid, name: doc.name, img: doc.img, description };
            } else {
              effect = { uuid: rank.effectUuid, name: rank.effectUuid, img: null, description: '' };
            }
          }
          return {
            key,
            rank,
            effect,
            tabLabel: rank.name || `${rankLabel} ${i + 1}`,
            activeClass: panelState[key]?.activeClass ?? '',
            hidden: panelState[key]?.hidden ?? '',
          };
        })
      );
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
    if (this.#advancementTable) this.#advancementTable.activateListeners(this);
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this._dragDrop.forEach((d) => d.bind(this.element));

    const dejectionInput = this.element.querySelector('.dejection-level-input');
    dejectionInput?.addEventListener('change', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const value = Math.min(15, Math.max(0, parseInt(dejectionInput.value) || 0));
      dejectionInput.value = value;
      await this.item.actor?.update({ 'system.dejection': value });
    });

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

    for (const zone of this.element.querySelectorAll('.bond-rank-effect-drop-zone')) {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('drag-over');
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('drag-over');
        let data;
        try {
          data =
            foundry.applications.ux.TextEditor.implementation.getDragEventData(e);
        } catch {
          try {
            data = JSON.parse(e.dataTransfer.getData('text/plain'));
          } catch {
            return;
          }
        }
        const key = zone.dataset.rankKey;
        if (!BOND_RANK_KEYS.includes(key)) return;
        if (data?.type !== 'ActiveEffect' || !data.uuid) {
          ui.notifications?.warn(game.i18n.localize('DASU.Bond.EffectDropInvalid'));
          return;
        }
        await this.item.update({ [`system.${key}.effectUuid`]: data.uuid });
      });
      const clearBtn = zone.querySelector('.bond-rank-effect-drop-zone__clear');
      clearBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const key = zone.dataset.rankKey;
        if (!BOND_RANK_KEYS.includes(key)) return;
        await this.item.update({ [`system.${key}.effectUuid`]: '' });
      });
      const nameEl = zone.querySelector('.bond-rank-effect-drop-zone__name[data-uuid]');
      if (nameEl) {
        zone.addEventListener('click', async () => {
          const doc = await fromUuid(nameEl.dataset.uuid);
          doc?.sheet?.render(true);
        });
      }
    }

    for (const zone of this.element.querySelectorAll('.bond-target-drop-zone')) {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('drag-over');
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('drag-over');
        let data;
        try {
          data =
            foundry.applications.ux.TextEditor.implementation.getDragEventData(e);
        } catch {
          try {
            data = JSON.parse(e.dataTransfer.getData('text/plain'));
          } catch {
            return;
          }
        }
        if (data?.type !== 'Actor' || !data.uuid) {
          ui.notifications?.warn(
            game.i18n.localize('DASU.Bond.TargetDropInvalid')
          );
          return;
        }
        const actor = await fromUuid(data.uuid);
        await this.item.update({
          'system.targetUuid': data.uuid,
          'system.targetName': actor?.name ?? '',
        });
      });
      const clearBtn = zone.querySelector('.bond-target-drop-zone__clear');
      clearBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.item.update({ 'system.targetUuid': '' });
      });
      const nameEl = zone.querySelector('.bond-target-drop-zone__name[data-uuid]');
      if (nameEl) {
        zone.addEventListener('click', async () => {
          const doc = await fromUuid(nameEl.dataset.uuid);
          doc?.sheet?.render(true);
        });
      }
    }

    for (const zone of this.element.querySelectorAll(
      '.ability-effect-drop-zone, section[data-tab="effects"]'
    )) {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('drag-over');
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    }

    const abilityEffectZone = this.element.querySelector('.ability-effect-drop-zone');
    if (abilityEffectZone) {
      for (const row of this.element.querySelectorAll('.ability-effect-row')) {
        const effectId = row.dataset.effectId;

        row.querySelector('.ability-effect__delete')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.item.deleteEmbeddedDocuments('ActiveEffect', [effectId]);
        });

        row.querySelector('.ability-effect__name')?.addEventListener('click', async () => {
          const effect = this.item.effects.get(effectId);
          effect?.sheet?.render(true);
        });

        const valInput = row.querySelector('.ability-effect__duration-value');
        const unitsSelect = row.querySelector('.ability-effect__duration-units');
        const targetSelect = row.querySelector('.ability-effect__apply-target');
        const updateDuration = async () => {
          const value = parseInt(valInput?.value) || null;
          const units = unitsSelect?.value ?? 'turns';
          await this.item.effects.get(effectId)?.update({ 'duration.value': value, 'duration.units': units });
        };
        valInput?.addEventListener('change', updateDuration);
        unitsSelect?.addEventListener('change', updateDuration);
        targetSelect?.addEventListener('change', async () => {
          await this.item.effects.get(effectId)?.update({ 'flags.dasu.applyTarget': targetSelect.value });
        });
      }
    }

    if (this.#advancementTable) {
      this.#advancementTable.activateAdvancementListeners(this.element);
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

  static async #onRegenerateDsid() {
    const name = this.item.name ?? '';
    const dsid = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    await this.item.update({ 'system.dsid': dsid });
  }

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

  static async #onAddArchetypeBonus() {
    const bonuses = this.item.system.toObject().bonuses ?? [];
    bonuses.push({ target: 'resources.hp.max', formula: '' });
    await this.item.update({ 'system.bonuses': bonuses });
  }

  static async #onDeleteArchetypeBonus(event, target) {
    const index = Number(target.dataset.index);
    const bonuses = this.item.system.toObject().bonuses ?? [];
    if (index < 0 || index >= bonuses.length) return;
    bonuses.splice(index, 1);
    await this.item.update({ 'system.bonuses': bonuses });
  }

  static async #onFieldsetTab(event, target) {
    await this.#fieldsets.onTab(event, target, this.document);
  }

  static async #onFieldsetSplit(event, target) {
    await this.#fieldsets.onSplit(event, target, this.document);
  }
}
