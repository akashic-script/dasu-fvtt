import { DASUTableRenderer } from './table-renderer.mjs';
import { CommonColumns } from './common-columns.mjs';
import { CommonDescriptions } from './common-descriptions.mjs';

export class ClassTableRenderer extends DASUTableRenderer {
  static TABLE_CONFIG = {
    cssClass: 'class-table',
    getItems: ClassTableRenderer.#getItems,
    renderDescription: CommonDescriptions.descriptionWithTags(
      ClassTableRenderer.#getTags
    ),
    columns: {
      name: CommonColumns.itemNameColumn({ columnName: 'TYPES.Item.class' }),
      controls: CommonColumns.itemControlsColumn({
        type: 'class',
        label: 'TYPES.Item.class',
        // Only one class allowed; hide the add button once one exists.
        disableAdd() {
          return (this.document?.itemTypes?.class?.length ?? 0) > 0;
        },
      }),
    },
  };

  static #getItems(document) {
    return document.itemTypes.class ?? [];
  }

  static #getTags(item) {
    const level = item.actor?.system?.level ?? 1;
    return [
      {
        label: 'DASU.Item.Class.AptitudeUp',
        value: item.system.aptitudeUpsTotal(level),
      },
    ];
  }
}
