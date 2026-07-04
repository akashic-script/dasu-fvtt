import { DASUTableRenderer } from './table-renderer.mjs';
import { ADVANCEMENT_TYPES } from '../../data/advancements/_module.mjs';

const TEMPLATE = (path) => `systems/dasu/templates/table/${path}.hbs`;

export class AdvancementTableRenderer extends DASUTableRenderer {
  static TABLE_CONFIG = {
    cssClass: 'advancement-table',
    tablePreset: 'custom',
    sort: false,
    advancedConfig: {
      getKey: (adv) => adv.id,
      keyDataAttribute: 'data-advancement-id',
      tableClass: 'advancement-list',
      rowClass: 'advancement',
      draggable: false,
    },
    columns: {
      level: {},
      type: {},
      summary: {},
      controls: {},
    },
    actions: {
      advancementCreate: AdvancementTableRenderer.#onAdvancementCreate,
      advancementDelete: AdvancementTableRenderer.#onAdvancementDelete,
    },
  };

  constructor({ editable, item, levelLabel, addTooltip, allowedTypes } = {}) {
    super();
    this._editable = editable;
    this._item = item;
    this._levelLabel = levelLabel ?? 'DASU.Item.Class.Level';
    this._addTooltip = addTooltip ?? 'DASU.Item.Class.AddAdvancement';
    this._allowedTypes = allowedTypes ?? null;
  }

  initializeOptions(config) {
    config.getItems = () => {
      return [...this._item.system.advancements].sort(
        (a, b) => a.level - b.level || a.sort - b.sort
      );
    };
    config.renderDescription = (adv) => this.#renderExpand(adv);

    config.columns.level = {
      renderHeader: () => game.i18n.localize(this._levelLabel),
      renderCell: (adv) => this.#renderLevelCell(adv),
    };
    config.columns.type = {
      renderHeader: () => game.i18n.localize('DASU.Advancement.Type'),
      renderCell: (adv) => this.#renderTypeCell(adv),
    };
    config.columns.summary = {
      renderHeader: () => '',
      renderCell: (adv) => this.#renderSummaryCell(adv),
    };
    config.columns.controls = {
      renderHeader: () => {
        if (!this._editable) return '';
        return `<button type="button" class="dasu-table__header-add" data-action="advancementCreate"
          data-tooltip="${game.i18n.localize(this._addTooltip)}">
          <i class="fas fa-plus"></i>
        </button>`;
      },
      renderCell: (adv) => this.#renderControlsCell(adv),
    };
  }

  async #renderLevelCell(adv) {
    return foundry.applications.handlebars.renderTemplate(
      TEMPLATE('cell/cell-advancement-level'),
      { adv, editable: this._editable }
    );
  }

  async #renderTypeCell(adv) {
    return foundry.applications.handlebars.renderTemplate(
      TEMPLATE('cell/cell-advancement-type'),
      {
        label: game.i18n.localize(adv.constructor.LABEL),
        icon: adv.constructor.ICON,
      }
    );
  }

  async #renderSummaryCell(adv) {
    return foundry.applications.handlebars.renderTemplate(
      TEMPLATE('cell/cell-advancement-grants'),
      { badges: adv.getBadges() }
    );
  }

  async #renderControlsCell(adv) {
    return foundry.applications.handlebars.renderTemplate(
      TEMPLATE('cell/cell-advancement-controls'),
      { adv, editable: this._editable }
    );
  }

  async #renderExpand(adv) {
    const item = this._item;
    const TextEditor = foundry.applications.ux.TextEditor.implementation;
    const description = await TextEditor.enrichHTML(adv.description ?? '', {
      relativeTo: item,
      secrets: item.isOwner,
      rollData: item.getRollData?.() ?? {},
    });

    const EXCLUDED_ITEM_TYPES = new Set(['class', 'schema']);
    const itemTypeOptions =
      adv.type === 'itemGrant'
        ? {
            '': game.i18n.localize('DASU.Item.Class.GrantTypeAny'),
            ...Object.fromEntries(
              Object.keys(CONFIG.Item.dataModels)
                .filter((type) => !EXCLUDED_ITEM_TYPES.has(type))
                .map((type) => [type, game.i18n.localize(`TYPES.Item.${type}`)])
            ),
          }
        : undefined;

    return foundry.applications.handlebars.renderTemplate(
      TEMPLATE('expand/expand-advancement'),
      {
        advancementId: adv.id,
        type: adv.type,
        description,
        editable: this._editable,
        itemTypeOptions,
        data: adv.getExpandData(),
      }
    );
  }

  activateAdvancementListeners(element) {
    for (const el of element.querySelectorAll(
      '[data-advancement-id][data-field]'
    )) {
      el.addEventListener('change', async () => {
        const { advancementId, field } = el.dataset;
        const advancement = this._item.system.advancements.get(advancementId);
        if (!advancement) return;
        let value = el.value;
        if (el.type === 'checkbox') {
          value = el.checked;
        } else if (el.type === 'number') {
          value = el.value === '' ? null : Number(el.value);
        }
        await advancement.update({ [field]: value });
      });
    }
  }

  static async #onAdvancementCreate() {
    const item = this._item;
    const type = await this.#promptType();
    if (!type) return;
    const levels = [...item.system.advancements].map((a) => a.level);
    const level = levels.length ? Math.max(...levels) + 1 : 1;
    await item.createEmbeddedDocuments('Advancement', [{ type, level }]);
  }

  async #promptType() {
    let types = ADVANCEMENT_TYPES;
    if (this._allowedTypes) {
      types = types.filter((cls) => this._allowedTypes.includes(cls.TYPE));
    }
    // A single allowed type needs no dialog.
    if (types.length === 1) return types[0].TYPE;
    const buttons = types.map((cls) => ({
      action: cls.TYPE,
      label: game.i18n.localize(cls.LABEL),
      icon: cls.ICON,
    }));
    try {
      return await foundry.applications.api.DialogV2.wait({
        window: { title: game.i18n.localize('DASU.Item.Class.AddAdvancement') },
        content: `<p>${game.i18n.localize('DASU.Advancement.ChooseType')}</p>`,
        buttons,
        rejectClose: false,
      });
    } catch {
      return null;
    }
  }

  static async #onAdvancementDelete(event, target) {
    const advancement = this._item.system.advancements.get(
      target.dataset.advancementId
    );
    await advancement?.delete();
  }
}
