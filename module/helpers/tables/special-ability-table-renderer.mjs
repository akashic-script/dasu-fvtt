import { DASUTableRenderer } from './table-renderer.mjs';
import { CommonColumns } from './common-columns.mjs';
import { CommonDescriptions } from './common-descriptions.mjs';
import { DASU } from '../config.mjs';

export class SpecialAbilityTableRenderer extends DASUTableRenderer {
  static TABLE_CONFIG = {
    cssClass: 'special-ability-table',
    getItems: SpecialAbilityTableRenderer.#getItems,
    renderDescription: CommonDescriptions.simpleDescription(),
    defaultExpanded: true,
    columns: {
      name: CommonColumns.itemNameColumn({
        columnName: 'TYPES.Item.specialAbility',
      }),
      kind: CommonColumns.textColumn({
        columnLabel: 'DASU.SpecialAbility.Kind.Label',
        getText: (item) =>
          game.i18n.localize(
            DASU.specialAbilityKinds?.[item.system.kind] ?? '–'
          ),
      }),
      controls: CommonColumns.itemControlsColumn({
        type: 'specialAbility',
        label: 'TYPES.Item.specialAbility',
        // Limit one Special Ability per daemon (see Archetype renderer).
        disableAdd() {
          return (this.document?.itemTypes?.specialAbility?.length ?? 0) > 0;
        },
      }),
    },
  };

  static #getItems(document) {
    return document.itemTypes.specialAbility ?? [];
  }
}
