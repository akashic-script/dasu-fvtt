import { DASUTableRenderer } from './table-renderer.mjs';
import { CommonColumns } from './common-columns.mjs';
import { CommonDescriptions } from './common-descriptions.mjs';

export class FeatureTableRenderer extends DASUTableRenderer {
  /** @type {TableConfig} */
  static TABLE_CONFIG = {
    cssClass: 'feature-table',
    getItems: FeatureTableRenderer.#getItems,
    renderDescription: CommonDescriptions.simpleDescription(),
    columns: {
      name: CommonColumns.itemNameColumn({ columnName: 'TYPES.Item.feature' }),
      controls: CommonColumns.itemControlsColumn({
        type: 'feature',
        label: 'TYPES.Item.feature',
        disableDelete: (item) => !(item.parent instanceof Actor),
        disableEdit: (item) => !(item.parent instanceof Actor),
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
    const exclude = DASUTableRenderer.slotOriginalIds(document);
    return (document.itemTypes.feature ?? []).filter((i) => !exclude.has(i.id));
  }
}
