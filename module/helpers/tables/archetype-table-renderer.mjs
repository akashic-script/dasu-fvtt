import { DASUTableRenderer } from './table-renderer.mjs';
import { CommonColumns } from './common-columns.mjs';
import { CommonDescriptions } from './common-descriptions.mjs';

export class ArchetypeTableRenderer extends DASUTableRenderer {
  static TABLE_CONFIG = {
    cssClass: 'archetype-table',
    getItems: ArchetypeTableRenderer.#getItems,
    renderDescription: CommonDescriptions.simpleDescription(),
    columns: {
      name: CommonColumns.itemNameColumn({
        columnName: 'TYPES.Item.archetype',
      }),
      bonuses: CommonColumns.textColumn({
        columnLabel: 'DASU.Archetype.Bonuses',
        alignment: 'start',
        getText: ArchetypeTableRenderer.#bonusSummary,
      }),
      controls: CommonColumns.itemControlsColumn({
        type: 'archetype',
        label: 'TYPES.Item.archetype',
        disableAdd() {
          return (this.document?.itemTypes?.archetype?.length ?? 0) > 0;
        },
      }),
    },
  };

  static #getItems(document) {
    return document.itemTypes.archetype ?? [];
  }

  static #bonusSummary(item) {
    const bonuses = item.system.bonuses ?? [];
    if (!bonuses.length) return '–';
    return bonuses
      .filter((b) => b.target && b.formula?.trim())
      .map((b) => `${b.formula} → ${b.target}`)
      .join(', ');
  }
}
