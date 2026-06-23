import { SYSTEM } from '../helpers/config.mjs';

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const systemTpl = (path) => `systems/${SYSTEM}/templates/${path}.hbs`;

export class DASUSchemaDialog extends HandlebarsApplicationMixin(
  ApplicationV2
) {
  /** @type {FUActor} */
  #actor;
  /** @type {FUItem} */
  #item;
  /** @type {number} currently selected rank */
  #level;
  /** @type {'minus'|'plus'} cost adjustment direction */
  #costDir = 'minus';

  constructor(actor, item, options = {}) {
    super(options);
    this.#actor = actor;
    this.#item = item;
    this.#level = item.system?.level ?? 1;
  }

  static DEFAULT_OPTIONS = {
    id: 'dasu-schema-dialog',
    tag: 'div',
    window: {
      title: 'DASU.Dialog.Schema.Title',
      icon: 'fas fa-gem',
      resizable: false,
    },
    position: { width: 320, height: 'auto' },
    actions: {
      use: DASUSchemaDialog.#onUse,
      cancel: DASUSchemaDialog.#onCancel,
      setCostDir: DASUSchemaDialog.#onSetCostDir,
    },
  };

  static PARTS = {
    form: { template: systemTpl('dialog/schema-dialog') },
  };

  get title() {
    return game.i18n.localize('DASU.Dialog.Schema.Title');
  }

  #rankResource() {
    return this.#item.system?.[`level${this.#level}`]?.resource;
  }

  async _prepareContext() {
    const sys = this.#item.system ?? {};
    const maxLevel = sys.level ?? 1;
    const levels = Array.from({ length: maxLevel }, (_, i) => i + 1).map(
      (lvl) => ({
        level: lvl,
        label: game.i18n.format('DASU.Dialog.Roll.SchemaLevel', { level: lvl }),
        selected: lvl === this.#level,
      })
    );

    const resource = this.#rankResource();
    const baseCost = parseInt(resource?.cost) || 0;
    const showCost = resource?.type != null;
    const resourceTypes = Object.entries(CONFIG.DASU.resourceTypes).map(
      ([key, i18nKey]) => ({
        key,
        label: game.i18n.localize(i18nKey),
        selected: key === resource?.type,
      })
    );

    const levelDescription = sys[`level${this.#level}`]?.description ?? '';

    return {
      itemName: this.#item.name,
      showLevels: maxLevel > 1,
      levels,
      levelDescription,
      showCost,
      baseCost,
      resourceTypes,
      costDir: this.#costDir,
    };
  }

  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);
    htmlElement
      .querySelector('[name="level"]')
      ?.addEventListener('change', (event) => {
        this.#level = parseInt(event.target.value) || 1;
        this.render();
      });
  }

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

  static async #onUse() {
    const checks = game.dasu?.Checks;
    if (!checks) return this.close();

    const form = this.element.querySelector('form');
    const level =
      parseInt(form.querySelector('[name="level"]')?.value) || this.#level;

    const resource = this.#item.system?.[`level${level}`]?.resource;
    const amount =
      parseInt(form.querySelector('[name="costAmount"]')?.value) || 0;
    const costType =
      form.querySelector('[name="costType"]')?.value || resource?.type;
    const baseCost = parseInt(resource?.cost) || 0;
    const value =
      this.#costDir === 'minus' ? baseCost - amount : baseCost + amount;
    const typeChanged = costType !== resource?.type;

    let cost = null;
    if (typeChanged || (amount !== 0 && value !== baseCost)) {
      cost = {
        type: costType,
        value: typeChanged && amount === 0 ? baseCost : value,
      };
    }

    await checks.displayCheck(this.#actor, this.#item, (check) => {
      check.additionalData.schemaLevel = level;
      if (cost) check.additionalData.dialogOverrides = { cost };
    });

    this.close();
  }

  static #onCancel() {
    this.close();
  }

  static open(actor, item) {
    return new DASUSchemaDialog(actor, item).render(true);
  }
}
