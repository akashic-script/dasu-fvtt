import { DASUTableRenderer } from './table-renderer.mjs';
import { CommonColumns } from './common-columns.mjs';
import { unslotTag } from '../tag-slotting.mjs';

/**
 * Renders the slotted tags panel on a host item sheet's advanced tab.
 * Each row represents a BaseTag pseudo-document slotted into the host item.
 */
export class SlottedTagTableRenderer extends DASUTableRenderer {
  static TABLE_CONFIG = {
    cssClass: 'slotted-tag-table',
    tablePreset: 'custom',
    sort: false,
    advancedConfig: {
      getKey: (tag) => tag.id,
      keyDataAttribute: 'data-tag-id',
      tableClass: 'slotted-tag-list',
      rowClass: 'slotted-tag',
      draggable: false,
    },
    columns: {
      name: {},
      rank: {},
      controls: {},
    },
    actions: {
      tagOpen: SlottedTagTableRenderer.#onTagOpen,
      tagDelete: SlottedTagTableRenderer.#onTagDelete,
      tagRankUp: SlottedTagTableRenderer.#onTagRankUp,
      tagRankDown: SlottedTagTableRenderer.#onTagRankDown,
    },
  };

  constructor({ item, editable } = {}) {
    super();
    this._item = item;
    this._editable = editable ?? true;
  }

  initializeOptions(config) {
    config.getItems = () => [...(this._item?.system?.tags ?? [])];

    config.columns.name = {
      renderHeader: () => 'Name',
      headerAlignment: 'start',
      renderCell: (tag) => {
        const uuid = tag.sourceUuid || '';
        const icon = uuid
          ? `<a class="slotted-tag__icon" data-action="tagOpen" data-tag-id="${
              tag.id
            }" data-tooltip="${game.i18n.localize(
              'DASU.Sheet.OpenSheet'
            )}"><i class="fas fa-tag"></i></a>`
          : `<span class="slotted-tag__icon slotted-tag__icon--placeholder"><i class="fas fa-tag"></i></span>`;
        return `<div class="slotted-tag__name-cell">${icon}<span class="slotted-tag__name">${
          tag.name ?? ''
        }</span></div>`;
      },
    };

    config.columns.rank = {
      renderHeader: () => game.i18n.localize('DASU.Tag.Rank'),
      renderCell: (tag) => {
        const free = this._item?.system?.tagBudgetFree ?? 0;
        const canUp = this._editable && free > 0;
        const canDown = this._editable && tag.rank.current > 1;
        return `<div class="slotted-tag__rank-stepper">
          <a class="slotted-tag__rank-btn ${
            canDown ? '' : 'slotted-tag__rank-btn--disabled'
          }" data-action="tagRankDown" data-tag-id="${
          tag.id
        }"><i class="fas fa-minus"></i></a>
          <span>${tag.rank.current}</span>
          <a class="slotted-tag__rank-btn ${
            canUp ? '' : 'slotted-tag__rank-btn--disabled'
          }" data-action="tagRankUp" data-tag-id="${
          tag.id
        }"><i class="fas fa-plus"></i></a>
        </div>`;
      },
    };

    config.columns.controls = {
      renderHeader: () => '',
      renderCell: (tag) => {
        if (!this._editable) return '';
        return `<a class="slotted-tag__delete" data-action="tagDelete" data-tag-id="${
          tag.id
        }" data-tooltip="${game.i18n.localize(
          'DASU.Sheet.DeleteItem'
        )}"><i class="fas fa-trash"></i></a>`;
      },
    };
  }

  static async #onTagOpen(event, target) {
    const tagId = target.dataset.tagId;
    const tag = this._item?.system?.tags?.get(tagId);
    if (!tag?.sourceUuid) return;
    const sourceItem = await fromUuid(tag.sourceUuid);
    sourceItem?.sheet?.render(true);
  }

  static async #onTagDelete(event, target) {
    const tagId = target.dataset.tagId;
    if (this._item) await unslotTag(this._item, tagId);
  }

  static async #onTagRankUp(event, target) {
    const tagId = target.dataset.tagId;
    const tag = this._item?.system?.tags?.get(tagId);
    if (!tag || (this._item.system.tagBudgetFree ?? 0) < 1) return;
    await tag.update({ 'rank.current': tag.rank.current + 1 });
  }

  static async #onTagRankDown(event, target) {
    const tagId = target.dataset.tagId;
    const tag = this._item?.system?.tags?.get(tagId);
    if (!tag || tag.rank.current <= 1) return;
    await tag.update({ 'rank.current': tag.rank.current - 1 });
  }
}
