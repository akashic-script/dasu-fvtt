import { SYSTEM } from '../helpers/config.mjs';
import { CheckConfiguration } from '../checks/check-configuration.mjs';

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const systemTpl = (path) => `systems/${SYSTEM}/templates/${path}.hbs`;

/**
 * Pre-roll dialog for attribute, skill, and item checks. Shows a "2d10 + N"
 * formula preview and fires the appropriate Checks entry point on confirm.
 */
export class DASURollDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {FUActor} */
  #actor;
  /** @type {'attribute'|'skill'|'item'|'initiative'} */
  #mode;
  /** @type {string} preselected attribute or skill key */
  #key;
  /** @type {FUItem|null} item being rolled (item mode only) */
  #item = null;
  /** @type {'accuracy'|'tactic'|'display'|null} resolved check type for the item */
  #itemCheckType = null;
  /** @type {number} */
  #mod = 0;
  /** @type {'normal'|'advantage'|'disadvantage'} */
  #advantage = 'normal';
  /** @type {string|null} */
  #difficulty = null;
  /** @type {'minus'|'plus'} cost adjustment direction (item mode) */
  #costDir = 'minus';
  /** @type {'minus'|'plus'} damage adjustment direction (item mode) */
  #damageDir = 'plus';
  /** @type {number} index of the chosen specialty for a skill check, or -1 for none */
  #specialty = -1;
  /** @type {FUItem|null} skill ability whose description seeds the check card */
  #skillAbility = null;

  constructor(actor, mode, key, options = {}) {
    super(options);
    this.#actor = actor;
    this.#mode = mode;
    this.#key = key;
    this.#item = options.item ?? null;
    this.#itemCheckType = options.itemCheckType ?? null;
    this.#skillAbility = options.skillAbility ?? null;
  }

  static DEFAULT_OPTIONS = {
    id: 'dasu-roll-dialog',
    tag: 'div',
    window: {
      title: 'Roll Check',
      icon: 'fas fa-dice',
      resizable: false,
    },
    position: { width: 320, height: 'auto' },
    actions: {
      roll: DASURollDialog.#onRoll,
      cancel: DASURollDialog.#onCancel,
      setAdvantage: DASURollDialog.#onSetAdvantage,
      setSpecialty: DASURollDialog.#onSetSpecialty,
      setCostDir: DASURollDialog.#onSetCostDir,
      setDamageDir: DASURollDialog.#onSetDamageDir,
    },
  };

  static PARTS = {
    form: { template: systemTpl('dialog/roll-dialog') },
  };

  get title() {
    return game.i18n.localize('DASU.Dialog.Roll.Title');
  }

  /**
   * The base "tick" (flat bonus added to the dice) for the current mode/selection.
   * @param {string} key  attribute/skill key (ignored in item mode)
   * @returns {number}
   */
  #computeTick(key) {
    const system = this.#actor.system;
    if (this.#mode === 'attribute') {
      return system.attributes?.[key]?.value ?? 0;
    }
    if (this.#mode === 'skill') {
      return system.skills?.[key]?.value ?? 0;
    }
    if (this.#mode === 'initiative') {
      // `dex` reads the attribute; any other key is a skill.
      return key === 'dex'
        ? system.attributes?.dex?.value ?? 0
        : system.skills?.[key]?.value ?? 0;
    }
    const item = this.#item;
    if (this.#itemCheckType === 'tactic') {
      return (system.stats?.land?.value ?? 0) + (item?.system?.toLand ?? 0);
    }
    return (system.stats?.hit?.value ?? 0) + (item?.system?.toHit ?? 0);
  }

  /**
   * Read the item-mode override controls from the form into a plain bag that
   * a late prepareCheck listener applies. Only includes fields that differ from
   * the item defaults so the resulting card tags stay meaningful.
   * @param {HTMLFormElement} form
   */
  #readOverrides(form) {
    const sys = this.#item?.system ?? {};
    const overrides = {};

    const range = form.querySelector('[name="range"]')?.value || null;
    if (range && range !== sys.range) overrides.range = range;

    const healEl = form.querySelector('[name="healAmount"]');
    if (healEl) {
      const healValue = parseInt(healEl.value);
      if (Number.isFinite(healValue) && healValue !== (sys.heal?.value ?? 0))
        overrides.healValue = healValue;
    }

    const damageType = form.querySelector('[name="damageType"]')?.value || null;
    if (damageType && damageType !== (sys.damage?.type ?? null))
      overrides.damageType = damageType;

    const damageEl = form.querySelector('[name="damageAmount"]');
    if (damageEl) {
      const amount = parseInt(damageEl.value) || 0;
      if (amount !== 0) {
        const govern = sys.govern ?? 'pow';
        const governValue =
          this.#actor?.system?.attributes?.[govern]?.value ?? 0;
        const baseAmount = governValue + (sys.damage?.value ?? 0);
        const value =
          this.#damageDir === 'minus'
            ? baseAmount - amount
            : baseAmount + amount;
        overrides.damageValue = Math.max(0, value);
      }
    }

    const amountEl = form.querySelector('[name="costAmount"]');
    const costType =
      form.querySelector('[name="costType"]')?.value || sys.resource?.type;
    if (amountEl) {
      const amount = parseInt(amountEl.value) || 0;
      const baseCost = parseInt(sys.resource?.cost) || 0;
      const value =
        this.#costDir === 'minus' ? baseCost - amount : baseCost + amount;
      const typeChanged = costType !== sys.resource?.type;
      if (typeChanged || (amount !== 0 && value !== baseCost)) {
        overrides.cost = {
          type: costType,
          value: typeChanged && amount === 0 ? baseCost : value,
        };
      }
    }

    const resistanceModes = Array.from(
      form.querySelectorAll('[name="resistMode"]:checked'),
      (el) => el.value
    );
    if (resistanceModes.length) overrides.resistanceModes = resistanceModes;

    return Object.keys(overrides).length ? overrides : null;
  }

  async _prepareContext() {
    const system = this.#actor.system;
    const attributes = Object.entries(CONFIG.DASU.attributes).map(
      ([key, i18nKey]) => ({
        key,
        label: game.i18n.localize(i18nKey),
        abbr: game.i18n.localize(CONFIG.DASU.attributeAbbreviations[key]),
        value: system.attributes?.[key]?.value ?? 0,
      })
    );

    const skills = Object.entries(CONFIG.DASU.skills).map(([key, i18nKey]) => ({
      key,
      label: game.i18n.localize(i18nKey),
      value: system.skills?.[key]?.value ?? 0,
    }));

    const selectedKey = this.#key;
    const mode = this.#mode;
    const isItem = mode === 'item';
    const isInitiative = mode === 'initiative';

    // Initiative source: DEX plus every skill, chosen from one dropdown.
    const initiativeSources = isInitiative
      ? [
          {
            key: 'dex',
            label: game.i18n.localize(CONFIG.DASU.attributes.dex),
            value: system.attributes?.dex?.value ?? 0,
          },
          ...skills,
        ]
      : [];

    const tick = this.#computeTick(selectedKey);

    const dicePart = this.#advantage !== 'normal' ? '3d10' : '2d10';
    const difficulties = CONFIG.DASU.difficulties.map((d) => ({
      key: d.key,
      label: game.i18n.localize(d.i18nKey),
      tn: CONFIG.DASU.getDifficultyTn(d.key),
    }));

    const overrideCtx = isItem ? this.#overrideContext() : {};

    // Specialties of the selected skill, shown as exclusive toggles (skill mode).
    const specialtySource =
      mode === 'skill' ? system.skills?.[selectedKey]?.specialties ?? [] : [];
    const specialties = specialtySource.map((s, i) => ({
      index: i,
      name: s.name,
      active: this.#specialty === i,
    }));
    const specialtyMod =
      this.#specialty >= 0 && this.#specialty < specialties.length ? 1 : 0;

    return {
      mode,
      isItem,
      isInitiative,
      initiativeSources,
      isDisplay: this.#itemCheckType === 'display',
      itemName: this.#item?.name ?? null,
      itemCheckType: this.#itemCheckType,
      selectedKey,
      actorName: this.#actor.name,
      attributes,
      skills,
      specialties,
      hasSpecialties: specialties.length > 0,
      specialtyNone: this.#specialty < 0,
      tick,
      mod: this.#mod,
      advantage: this.#advantage,
      difficulty: this.#difficulty,
      difficulties,
      formula: `${dicePart} + ${tick + this.#mod + specialtyMod}`,
      ...overrideCtx,
    };
  }

  /** Build the override-control context for item mode. */
  #overrideContext() {
    const item = this.#item;
    const sys = item?.system ?? {};
    const type = item?.type;

    const isDisplay = this.#itemCheckType === 'display';

    const showRange = !isDisplay && type === 'weapon';
    const ranges = Object.entries(CONFIG.DASU.weaponRanges).map(
      ([key, i18nKey]) => ({
        key,
        label: game.i18n.localize(i18nKey),
        selected: key === sys.range,
      })
    );

    const dmg = sys.damage;
    const showDamageType = !isDisplay && dmg != null && dmg.type !== 'untyped';
    // Rolled damage is the governing attribute + the item's base value; the
    // field shows and edits that final amount.
    const govern = sys.govern ?? 'pow';
    const governValue = this.#actor?.system?.attributes?.[govern]?.value ?? 0;
    const baseDamage = governValue + (dmg?.value ?? 0);
    const damageTypes = Object.entries(CONFIG.DASU.damageTypes).map(
      ([key, i18nKey]) => ({
        key,
        label: game.i18n.localize(i18nKey),
        selected: key === dmg?.type,
      })
    );

    const showCost = sys.resource?.type != null;
    const baseCost = parseInt(sys.resource?.cost) || 0;
    const resourceTypes = Object.entries(CONFIG.DASU.resourceTypes).map(
      ([key, i18nKey]) => ({
        key,
        label: game.i18n.localize(i18nKey),
        selected: key === sys.resource?.type,
      })
    );

    const showHeal =
      isDisplay && type === 'ability' && sys.category === 'restorative';
    const baseHeal = sys.heal?.value ?? 0;
    const healMode = sys.heal?.mode ?? 'flat';
    const healResource = sys.heal?.resource
      ? game.i18n.localize(
          CONFIG.DASU.abilityHealResources[sys.heal.resource] ??
            sys.heal.resource
        )
      : '';
    const healPrefix =
      healMode === 'tick'
        ? `${game.i18n
            .localize(
              CONFIG.DASU.attributeAbbreviations?.[sys.heal?.attribute] ?? ''
            )
            .toUpperCase()}+`
        : '';
    const healSuffix = healMode === 'percent' ? '%' : '';

    const ignoreModes = [
      {
        mode: 'resist',
        label: game.i18n.localize('DASU.Dialog.Roll.IgnoreResist'),
      },
      {
        mode: 'nullify',
        label: game.i18n.localize('DASU.Dialog.Roll.IgnoreNullify'),
      },
      {
        mode: 'drain',
        label: game.i18n.localize('DASU.Dialog.Roll.IgnoreDrain'),
      },
      {
        mode: 'weak',
        label: game.i18n.localize('DASU.Dialog.Roll.IgnoreWeak'),
      },
    ];

    return {
      showRange,
      ranges,
      showDamageType,
      baseDamage,
      damageDir: this.#damageDir,
      damageTypes,
      showCost,
      baseCost,
      showHeal,
      baseHeal,
      healResource,
      healPrefix,
      healSuffix,
      resourceTypes,
      costDir: this.#costDir,
      showResistOverrides: showDamageType,
      ignoreModes,
    };
  }

  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);

    const updatePreview = () => {
      const keyEl = htmlElement.querySelector('[name="key"]');
      const modEl = htmlElement.querySelector('[name="mod"]');
      const key = keyEl?.value ?? this.#key;
      const mod = parseInt(modEl?.value) || 0;

      const tick = this.#computeTick(key);
      const dicePart = this.#advantage !== 'normal' ? '3d10' : '2d10';
      const total = tick + mod;
      const previewEl = htmlElement.querySelector('.roll-dialog__formula');
      if (previewEl) previewEl.textContent = `${dicePart} + ${total}`;
    };

    htmlElement
      .querySelector('[name="key"]')
      ?.addEventListener('change', (e) => {
        // In skill mode the specialty list depends on the skill, so re-render to
        // refresh it (and reset the chosen specialty); otherwise just preview.
        if (this.#mode === 'skill') {
          this.#key = e.target.value;
          this.#specialty = -1;
          this.render();
        } else {
          updatePreview();
        }
      });
    htmlElement
      .querySelector('[name="mod"]')
      ?.addEventListener('input', updatePreview);
    htmlElement
      .querySelector('[name="difficulty"]')
      ?.addEventListener('change', (e) => {
        this.#difficulty = e.target.value || null;
      });
  }

  /** Exclusive specialty toggle: clicking the active one clears it (none). */
  static #onSetSpecialty(event, target) {
    const idx = Number(target.dataset.index);
    this.#specialty = this.#specialty === idx ? -1 : idx;
    this.render();
  }

  static #onSetAdvantage(event, target) {
    const value = target.dataset.value;
    if (!value) return;
    this.#advantage = this.#advantage === value ? 'normal' : value;
    this.render();
  }

  /** Exclusive minus/plus cost direction toggle. */
  static #onSetCostDir(event, target) {
    const value = target.dataset.value;
    if (value !== 'minus' && value !== 'plus') return;
    this.#costDir = value;
    for (const btn of this.element.querySelectorAll(
      '[data-action="setCostDir"]'
    )) {
      btn.classList.toggle('is-active', btn.dataset.value === value);
    }
  }

  /** Exclusive minus/plus damage direction toggle. */
  static #onSetDamageDir(event, target) {
    const value = target.dataset.value;
    if (value !== 'minus' && value !== 'plus') return;
    this.#damageDir = value;
    for (const btn of this.element.querySelectorAll(
      '[data-action="setDamageDir"]'
    )) {
      btn.classList.toggle('is-active', btn.dataset.value === value);
    }
  }

  static async #onRoll(event, target) {
    const form = this.element.querySelector('form');
    const key = form.querySelector('[name="key"]')?.value ?? this.#key;
    const mod = parseInt(form.querySelector('[name="mod"]')?.value) || 0;
    const difficulty = form.querySelector('[name="difficulty"]')?.value || null;
    const advantage = this.#advantage;

    const checks = game.dasu?.Checks;
    if (!checks) return this.close();

    const tn = difficulty ? CONFIG.DASU.getDifficultyTn(difficulty) : null;

    const overrides = this.#mode === 'item' ? this.#readOverrides(form) : null;

    // Resolve the chosen specialty (skill mode) to a +1 named modifier.
    const specialtyName =
      this.#mode === 'skill' && this.#specialty >= 0
        ? this.#actor.system?.skills?.[key]?.specialties?.[this.#specialty]
            ?.name
        : null;

    const configCallback = (check) => {
      if (mod)
        check.modifiers.push({
          label: game.i18n.localize('DASU.Dialog.Roll.Modifier'),
          value: mod,
          source: 'dialog',
        });
      if (specialtyName)
        check.modifiers.push({
          label: game.i18n.format('DASU.Dialog.Roll.SpecialtyMod', {
            name: specialtyName,
          }),
          value: 1,
          source: 'specialty',
        });
      if (advantage === 'advantage') check.advantage = true;
      if (advantage === 'disadvantage') check.disadvantage = true;
      if (tn != null) CheckConfiguration.configure(check).setTargetNumber(tn);
      if (overrides) check.additionalData.dialogOverrides = overrides;
      if (this.#skillAbility) {
        const sa = this.#skillAbility;
        check.additionalData.skillAbility = {
          name: sa.name,
          description: sa.system.description ?? '',
          thresholdType: sa.system.thresholdType,
          fixedTN: sa.system.fixedTN,
        };
      }
    };

    if (this.#mode === 'initiative') {
      const combat = game.combat;
      const combatant = combat?.combatants.find(
        (c) => c.actor?.id === this.#actor.id
      );
      if (combatant) {
        // `dex` uses the default primary; any other key rolls with that skill.
        await combat.rollInitiative([combatant.id], {
          skill: key === 'dex' ? null : key,
          configure: configCallback,
        });
      }
    } else if (this.#mode === 'item') {
      if (this.#itemCheckType === 'tactic') {
        await checks.tacticCheck(this.#actor, this.#item, configCallback);
      } else if (this.#itemCheckType === 'display') {
        await checks.displayCheck(this.#actor, this.#item, configCallback);
      } else {
        await checks.accuracyCheck(this.#actor, this.#item, configCallback);
      }
    } else if (this.#mode === 'attribute') {
      await checks.attributeCheck(
        this.#actor,
        { primary: key, secondary: null },
        undefined,
        configCallback
      );
    } else {
      await checks.skillCheck(this.#actor, key, undefined, configCallback);
    }

    this.close();
  }

  static #onCancel() {
    this.close();
  }

  static openAttribute(actor, attributeKey) {
    return new DASURollDialog(actor, 'attribute', attributeKey).render(true);
  }

  /**
   * Initiative dialog: choose DEX or a skill as the source, plus a situational
   * modifier. Rolls through the actor's combatant.
   * @param {FUActor} actor
   * @param {string} [sourceKey='dex']  'dex' or a skill key.
   */
  static openInitiative(actor, sourceKey = 'dex') {
    return new DASURollDialog(actor, 'initiative', sourceKey).render(true);
  }

  static openSkill(actor, skillKey, options = {}) {
    return new DASURollDialog(actor, 'skill', skillKey, options).render(true);
  }

  /**
   * @param {FUActor} actor
   * @param {FUItem} item
   * @param {'accuracy'|'tactic'|'display'} checkType
   */
  static openItem(actor, item, checkType) {
    return new DASURollDialog(actor, 'item', null, {
      item,
      itemCheckType: checkType,
    }).render(true);
  }
}
