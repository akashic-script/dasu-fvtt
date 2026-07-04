import { DASUTableRenderer } from './table-renderer.mjs';
import { CommonColumns } from './common-columns.mjs';
import { CommonDescriptions } from './common-descriptions.mjs';
import { DASU } from '../config.mjs';

/**
 * Renders the tag catalog on the actor sheet Items tab.
 * Shows tag Items owned by the actor so the GM can author and organise the
 * catalog; actual slotting happens by dragging from here onto host item rows
 * or onto a host item sheet.
 */
export class TagCatalogRenderer extends DASUTableRenderer {
  static TABLE_CONFIG = {
    cssClass: 'tag-catalog-table',
    getItems: TagCatalogRenderer.#getItems,
    renderDescription: CommonDescriptions.descriptionWithTags(
      TagCatalogRenderer.#getTags
    ),
    columns: {
      name: CommonColumns.itemNameColumn({ columnName: 'TYPES.Item.tag' }),
      price: CommonColumns.textColumn({
        columnLabel: 'DASU.Tag.Price',
        getText: (item) => item.system.pricePerRank || '-',
      }),
      applicableTypes: CommonColumns.textColumn({
        columnLabel: 'DASU.Tag.Types',
        getText: (item) => {
          const types = item.system.applicableTypes ?? [];
          if (!types.length || types.includes('all'))
            return game.i18n.localize('DASU.Tag.ApplicableAll');
          return types
            .map((t) => game.i18n.localize(`TYPES.Item.${t}`) || t)
            .join(', ');
        },
      }),
      controls: CommonColumns.itemControlsColumn(
        { type: 'tag', label: 'TYPES.Item.tag' },
        {
          disableDelete: (item) => !(item.parent instanceof Actor),
          disableEdit: (item) => !(item.parent instanceof Actor),
        }
      ),
    },
  };

  static #getItems(document) {
    return document.itemTypes.tag ?? [];
  }

  static #getTags(item) {
    const localizeAll = game.i18n.localize('DASU.Tag.ApplicableAll');

    const types = item.system.applicableTypes ?? [];
    const typesValue =
      !types.length || types.includes('all')
        ? localizeAll
        : types
            .map((t) => game.i18n.localize(`TYPES.Item.${t}`) || t)
            .join(', ');

    const subTypeLabels = Object.assign({}, ...Object.values(DASU.tagSubTypes));
    const subTypes = item.system.applicableSubType ?? [];
    const subTypesValue = !subTypes.length
      ? localizeAll
      : subTypes
          .map((s) => game.i18n.localize(subTypeLabels[s] ?? '') || s)
          .join(', ');

    return [
      { label: 'DASU.Tag.ApplicableTypes', value: typesValue },
      { label: 'DASU.Tag.ApplicableSubType', value: subTypesValue },
    ];
  }
}
