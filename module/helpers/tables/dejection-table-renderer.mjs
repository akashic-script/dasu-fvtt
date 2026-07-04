import { DASUTableRenderer } from './table-renderer.mjs';
import { CommonColumns } from './common-columns.mjs';
import { CommonDescriptions } from './common-descriptions.mjs';

/** The single Dejection item (like Class), exposing the current track level. */
export class DejectionTableRenderer extends DASUTableRenderer {
  static TABLE_CONFIG = {
    cssClass: 'dejection-table',
    getItems: (document) => document.itemTypes.dejection ?? [],
    renderDescription: CommonDescriptions.descriptionWithTags((item) => {
      const dej = item.actor?.system?.dejection ?? 0;
      return [{ label: 'DASU.Dejection.Track', value: `${dej} / 15` }];
    }),
    columns: {
      name: CommonColumns.itemNameColumn({
        columnName: 'TYPES.Item.dejection',
      }),
      controls: CommonColumns.itemControlsColumn({
        type: 'dejection',
        label: 'TYPES.Item.dejection',
        // Only one Dejection item allowed.
        disableAdd() {
          return (this.document?.itemTypes?.dejection?.length ?? 0) > 0;
        },
      }),
    },
  };
}
