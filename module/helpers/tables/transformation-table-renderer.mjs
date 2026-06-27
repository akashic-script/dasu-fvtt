import { DASUTableRenderer } from './table-renderer.mjs';

/**
 * Renders a daemon's `system.transformations` array (the forms it can shift
 * into), mirroring the stock table. Pass `{ readonly: true }` for the
 * summoner's stocked-daemon view to disable the threshold and drop remove.
 */
export class TransformationTableRenderer extends DASUTableRenderer {
  #readonly = false;

  constructor({ readonly = false, ...overrides } = {}) {
    super(overrides);
    this.#readonly = readonly;
  }

  static TABLE_CONFIG = {
    tablePreset: 'custom',
    cssClass: 'transformation-table',
    sort: false,
    getItems: TransformationTableRenderer.#getItems,
    advancedConfig: {
      getKey: (row) => String(row.index),
      keyDataAttribute: 'data-transformation-index',
      additionalRowAttributes: [
        {
          attributeName: 'data-transformation-index',
          getAttributeValue: (row) => String(row.index),
        },
      ],
      tableClass: 'item-list',
      rowClass: 'item',
      draggable: false,
    },
    columns: {
      name: {
        renderHeader: () => game.i18n.localize('TYPES.Actor.daemon'),
        headerAlignment: 'start',
        renderCell: TransformationTableRenderer.prototype.renderNameCell,
      },
      threshold: {
        renderHeader: () =>
          game.i18n.localize('DASU.Transformation.MeritThreshold'),
        renderCell: TransformationTableRenderer.prototype.renderThresholdCell,
      },
      controls: {
        hideHeader: true,
        renderCell: TransformationTableRenderer.prototype.renderControlsCell,
      },
    },
    actions: {
      transformationRemove: TransformationTableRenderer.prototype.onRemove,
    },
  };

  async renderNameCell(row) {
    return foundry.applications.handlebars.renderTemplate(
      'systems/dasu/templates/table/cell/cell-item-name.hbs',
      {
        name: row.name,
        img: row.img,
        uuid: row.uuid,
        rollable: false,
        caption: null,
        cssClass: row.missing ? 'transformation--missing' : null,
      }
    );
  }

  renderThresholdCell(row) {
    const reachedIcon = row.reached
      ? `<i class="fas fa-circle-check transformation__reached" data-tooltip="${game.i18n.localize(
          'DASU.Transformation.Reached'
        )}"></i>`
      : `<i class="far fa-circle transformation__not-reached" data-tooltip="${game.i18n.localize(
          'DASU.Transformation.NotReached'
        )}"></i>`;
    const disabled = this.#readonly ? 'disabled' : '';
    return `<div class="transformation__threshold">
      <input class="transformation__threshold-input" type="number" min="0"
        value="${row.meritThreshold}" ${disabled} />
      ${reachedIcon}
    </div>`;
  }

  renderControlsCell() {
    if (this.#readonly) return '';
    return `<div class="cell-item-controls">
      <a class="cell-item-controls__control" data-action="transformationRemove" data-tooltip="${game.i18n.localize(
        'DASU.Transformation.Remove'
      )}"><i class="fas fa-trash"></i></a>
    </div>`;
  }

  async onRemove(event, target) {
    const li = target.closest('[data-transformation-index]');
    const index = Number(li?.dataset?.transformationIndex);
    // The table always renders against the owning daemon, so this.document is it.
    const daemon = this.document;
    if (daemon?.type !== 'daemon' || Number.isNaN(index)) return;
    const list = foundry.utils.deepClone(daemon.system.transformations ?? []);
    if (!list[index]) return;
    list.splice(index, 1);
    await daemon.update({ 'system.transformations': list });
  }

  static #getItems(document) {
    return document.system.transformationRows ?? [];
  }
}
