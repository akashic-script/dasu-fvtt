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
        let effectDescription = '';
        if (effect) {
          const raw = await TextEditor.enrichHTML(effect.description ?? '', {
            relativeTo: effect,
            secrets: false,
          });
          effectDescription = raw.replace(/^<p>(.*)<\/p>$/s, '$1').trim();
        }
        return {
          name: rank.name,
          threshold: rank.threshold,
          abilityType: rank.abilityType,
          effectName: effect?.name ?? '',
          effectDescription,
        };
      })
    );
    return foundry.applications.handlebars.renderTemplate(
      'systems/dasu/templates/table/expand/expand-bond.hbs',
      {
        ranks,
        affinity: sys.affinity,
        targetName: sys.resolvedTargetName,
        negative: sys.negative,
        description: await TextEditor.enrichHTML(item.system.description ?? '', {
          relativeTo: item,
          secrets: false,
        }).then((r) => r.trim().replace(/^<p>(.*)<\/p>$/s, '$1').trim()),
      }
    );
  }
}
