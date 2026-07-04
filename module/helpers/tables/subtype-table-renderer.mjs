import { DASUTableRenderer } from './table-renderer.mjs';
import { CommonColumns } from './common-columns.mjs';
import { CommonDescriptions } from './common-descriptions.mjs';

export class SubtypeTableRenderer extends DASUTableRenderer {
  static TABLE_CONFIG = {
    cssClass: 'subtype-table',
    getItems: SubtypeTableRenderer.#getItems,
    renderDescription: CommonDescriptions.simpleDescription(),
    columns: {
      name: CommonColumns.itemNameColumn({
        columnName: 'TYPES.Item.subtype',
      }),
      stat: CommonColumns.textColumn({
        columnLabel: 'DASU.Subtype.StatShort',
        getText: (item) => `+${item.system.statAllocationBonus}`,
      }),
      abilities: CommonColumns.textColumn({
        columnLabel: 'DASU.Subtype.AbilityShort',
        getText: (item) => item.system.maxAbilitySlots,
      }),
      tactics: CommonColumns.textColumn({
        columnLabel: 'DASU.Subtype.TacticShort',
        getText: (item) => item.system.maxTacticSlots,
      }),
      controls: CommonColumns.itemControlsColumn({
        type: 'subtype',
        label: 'TYPES.Item.subtype',
        compendium: 'dasu.subtypes',
      }),
    },
  };

  static #getItems(document) {
    return document.itemTypes.subtype ?? [];
  }
}
