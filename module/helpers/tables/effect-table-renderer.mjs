import { DASUTableRenderer } from './table-renderer.mjs';
import { CommonColumns } from './common-columns.mjs';
import { onManageActiveEffect } from '../effects.mjs';

const TEMPLATE = (path) => `systems/dasu/templates/table/${path}.hbs`;

export class EffectTableRenderer extends DASUTableRenderer {
  /** @type {TableConfig} */
  static TABLE_CONFIG = {
    cssClass: 'effect-table',
    tablePreset: 'effect',
    sort: false,
    columns: {
      name: CommonColumns.itemAnchorColumn(),
      source: CommonColumns.textColumn({
        columnLabel: 'DASU.Effect.Source',
        getText: (effect) => effect.sourceName ?? '',
        tooltip: (effect) => effect.sourceName ?? '',
      }),
      duration: CommonColumns.textColumn({
        columnLabel: 'EFFECT.DURATION.Label',
        getText: (effect) => effect.duration?.label ?? '',
        tooltip: (effect) => effect.duration?.label ?? '',
      }),
      controls: CommonColumns.itemControlsColumn(),
    },
    actions: {
      create: EffectTableRenderer.#onEffectAction,
      edit: EffectTableRenderer.#onEffectAction,
      delete: EffectTableRenderer.#onEffectAction,
      toggle: EffectTableRenderer.#onEffectAction,
      menu: EffectTableRenderer.#onEffectAction,
    },
  };

  /**
   * @param {'temporary'|'passive'|'inactive'} sectionType
   * @param {string} sectionLabel  i18n key
   * @param {(document: Document) => ActiveEffect[]} getEffects
   */
  constructor(sectionType, sectionLabel, getEffects) {
    super({
      _effectSectionType: sectionType,
      _effectSectionLabel: sectionLabel,
      _effectGetItems: getEffects,
    });
  }

  initializeOptions(config) {
    const sectionType = config._effectSectionType;
    const sectionLabel = config._effectSectionLabel;
    const getEffects = config._effectGetItems;

    delete config._effectSectionType;
    delete config._effectSectionLabel;
    delete config._effectGetItems;

    config.getItems = (document) => getEffects(document);

    config.columns.name = CommonColumns.itemAnchorColumn({
      columnName: sectionLabel,
      headerAlignment: 'start',
    });

    config.columns.controls = {
      renderHeader: async () =>
        foundry.applications.handlebars.renderTemplate(
          TEMPLATE('header/header-effect-controls'),
          { sectionType }
        ),
      renderCell: async () =>
        foundry.applications.handlebars.renderTemplate(
          TEMPLATE('cell/cell-item-controls'),
          {
            isGM: game.user.isGM,
            disableEdit: false,
            disableMenu: false,
            disableDelete: true,
            hideDelete: true,
          }
        ),
    };

    config.advancedConfig.additionalRowAttributes.push({
      attributeName: 'data-effect-type',
      getAttributeValue: () => sectionType,
    });
  }

  static #onEffectAction(event, target) {
    event.preventDefault();
    event.stopPropagation();
    const document = this.application?.document;
    if (!document) return;
    onManageActiveEffect(event, document, target);
  }
}
