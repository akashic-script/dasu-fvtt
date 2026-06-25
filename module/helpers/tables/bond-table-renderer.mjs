import { DASUTableRenderer } from './table-renderer.mjs';
import { CommonColumns } from './common-columns.mjs';
import DASUBond from '../../data/bond.mjs';

export class BondTableRenderer extends DASUTableRenderer {
  static TABLE_CONFIG = {
    cssClass: 'bond-table',
    getItems: (document) => document.itemTypes.bond ?? [],
    renderDescription: BondTableRenderer.#renderDescription,
    columns: {
      name: CommonColumns.itemNameColumn({ columnName: 'TYPES.Item.bond' }),
      affinity: CommonColumns.textColumn({
        columnLabel: 'DASU.Bond.Affinity',
        getText: (item) => item.system.affinity,
      }),
      rank: CommonColumns.textColumn({
        columnLabel: 'DASU.Bond.CurrentRank',
        getText: (item) => item.system.currentRank?.name ?? game.i18n.localize('DASU.Bond.NoRank'),
      }),
      controls: CommonColumns.itemControlsColumn({
        type: 'bond',
        label: 'TYPES.Item.bond',
        disableDelete: (item) => !(item.parent instanceof Actor),
        disableEdit: (item) => !(item.parent instanceof Actor),
      }),
    },
  };

  static async #renderDescription(item) {
    const sys = item.system;
    const TextEditor = foundry.applications.ux.TextEditor.implementation;
    const ranks = await Promise.all(
      DASUBond.RANK_KEYS.map(async (key) => {
        const rank = sys[key];
        const effect = rank.effectUuid ? await fromUuid(rank.effectUuid) : null;
        const effectDescription = effect
          ? await TextEditor.enrichHTML(effect.description ?? '', {
              relativeTo: effect,
              secrets: false,
            })
          : '';
        return {
          name: rank.name,
          threshold: rank.threshold,
          abilityType: rank.abilityType,
          effectDescription,
        };
      })
    );
    return foundry.applications.handlebars.renderTemplate(
      'systems/dasu/templates/table/expand/expand-bond.hbs',
      { ranks, affinity: sys.affinity }
    );
  }
}
