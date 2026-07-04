import { DASUTableRenderer } from './table-renderer.mjs';
import { CommonColumns } from './common-columns.mjs';
import { CommonDescriptions } from './common-descriptions.mjs';
import { DASU } from '../config.mjs';

export class TacticTableRenderer extends DASUTableRenderer {
  /** @type {TableConfig} */
  static TABLE_CONFIG = {
    cssClass: 'tactic-table',
    getItems: TacticTableRenderer.#getItems,
    renderDescription: CommonDescriptions.descriptionWithTags(
      TacticTableRenderer.#getTags
    ),
    renderRowCaption: CommonDescriptions.slottedTagCaption(),
    columns: {
      name: CommonColumns.itemNameColumn({ columnName: 'TYPES.Item.tactic' }),
      damage: CommonColumns.textColumn({
        columnLabel: 'DASU.Item.Tactic.Damage',
        getText: (item) => {
          const d = item.system.damage;
          const val = d?.value ?? 0;
          const typeLabel = d?.typeLabel ?? '';
          const governAbbr = game.i18n
            .localize(DASU.attributeAbbreviations[item.system.govern] ?? '')
            .toUpperCase();
          return `${governAbbr}+${val} ${typeLabel}`.trim();
        },
      }),
      cost: CommonColumns.htmlColumn({
        columnLabel: 'DASU.Item.Tactic.Cost',
        getHtml: (item) => {
          const r = item.system.resource;
          if (!r) return '-';
          const raw = game.i18n.localize(
            DASU.resourceAbbreviations[r.type] ?? ''
          );
          const abbr =
            raw === '¤'
              ? `<span class="cell-cost__currency">${raw}</span>`
              : raw || r.type.toUpperCase();
          return `${r.cost} ${abbr}`;
        },
      }),
      toLand: CommonColumns.textColumn({
        columnLabel: 'DASU.Actor.Stat.Land.abbr',
        getText: (item) =>
          item.system.isInfinity ? '∞' : item.system.toLand ?? '-',
      }),
      controls: CommonColumns.itemControlsColumn({
        disableAdd: true,
        disableDelete: (item) => !(item.parent instanceof Actor),
        disableEdit: (item) => !(item.parent instanceof Actor),
      }),
    },
  };

  static #getItems(document) {
    const exclude = DASUTableRenderer.slotOriginalIds(document);
    return (document.itemTypes.tactic ?? []).filter((i) => !exclude.has(i.id));
  }

  static #getTags(item) {
    const tags = [
      {
        label: 'DASU.Item.Tactic.Govern',
        value: game.i18n.localize(DASU.attributes[item.system.govern] ?? ''),
      },
    ];

    if (item.system.isInfinity) {
      tags.push({ label: 'DASU.Item.Tactic.IsInfinity', value: '∞' });
    } else {
      tags.push({
        label: 'DASU.Actor.Stat.Land.abbr',
        value: item.system.toLand,
      });
    }

    tags.push({
      label: 'DASU.Item.Tactic.Damage',
      value: `${item.system.damage?.value ?? 0} ${
        item.system.damage?.typeLabel ?? ''
      }`.trim(),
    });

    return tags;
  }
}
