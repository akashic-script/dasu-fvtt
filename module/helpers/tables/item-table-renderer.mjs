import { DASUTableRenderer } from './table-renderer.mjs';
import { CommonColumns } from './common-columns.mjs';
import { CommonDescriptions } from './common-descriptions.mjs';
import { DASU } from '../config.mjs';

export class ItemTableRenderer extends DASUTableRenderer {
  /** @type {TableConfig} */
  static TABLE_CONFIG = {
    cssClass: 'item-table',
    getItems: ItemTableRenderer.#getItems,
    renderDescription: CommonDescriptions.descriptionWithTags(
      ItemTableRenderer.#getTags
    ),
    columns: {
      name: CommonColumns.itemNameColumn({ columnName: 'TYPES.Item.item' }),
      effect: CommonColumns.textColumn({
        columnLabel: 'DASU.Item.Item.Effect',
        getText: (item) => {
          const effect = item.system.effects?.[0];
          if (!effect) return '-';
          const resource = game.i18n.localize(
            DASU.itemResources[effect.resource] ?? ''
          );
          if (effect.mode === 'tick') {
            const attr = game.i18n
              .localize(DASU.attributeAbbreviations[effect.attribute] ?? '')
              .toUpperCase();
            return `${attr}+${effect.value} ${resource}`.trim();
          }
          if (effect.mode === 'percent') {
            return `${effect.value}% ${resource}`.trim();
          }
          return `${effect.value} ${resource}`.trim();
        },
      }),
      price: CommonColumns.textColumn({
        columnLabel: 'DASU.Item.Item.Price',
        getText: (item) => item.system.resource?.cost ?? '-',
      }),
      qty: CommonColumns.textColumn({
        columnLabel: 'DASU.Item.Item.Quantity',
        getText: (item) => item.system.quantity ?? '-',
      }),
      controls: CommonColumns.itemControlsColumn({
        type: 'item',
        label: 'TYPES.Item.item',
      }),
    },
  };

  initializeOptions(config) {
    config.advancedConfig.additionalRowAttributes.push({
      attributeName: 'data-category',
      getAttributeValue: (item) => item.system.category ?? '',
    });
  }

  static #getItems(document) {
    return document.itemTypes.item ?? [];
  }

  static #getTags(item) {
    return [
      {
        label: 'DASU.Item.Item.Resource',
        value: game.i18n.localize(
          DASU.itemResources[item.system.effects?.[0]?.resource] ?? ''
        ),
      },
      {
        label: 'DASU.Item.Item.Quantity',
        value: item.system.quantity ?? '-',
      },
    ];
  }
}
