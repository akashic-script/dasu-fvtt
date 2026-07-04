import { DASUTableRenderer } from './table-renderer.mjs';
import { CommonColumns } from './common-columns.mjs';

/** Embedded Scar items a summoner has accumulated from Dejection. */
export class ScarTableRenderer extends DASUTableRenderer {
  static TABLE_CONFIG = {
    cssClass: 'scar-table',
    getItems: (document) => document.itemTypes.scar ?? [],
    columns: {
      name: CommonColumns.itemNameColumn({ columnName: 'TYPES.Item.scar' }),
      controls: CommonColumns.itemControlsColumn({
        type: 'scar',
        label: 'TYPES.Item.scar',
        disableDelete: (item) => !(item.parent instanceof Actor),
        disableEdit: (item) => !(item.parent instanceof Actor),
      }),
    },
  };
}
