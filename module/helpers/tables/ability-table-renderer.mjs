import { DASUTableRenderer } from './table-renderer.mjs';
import { CommonColumns } from './common-columns.mjs';
import { CommonDescriptions } from './common-descriptions.mjs';
import { DASU } from '../config.mjs';

export class AbilityTableRenderer extends DASUTableRenderer {
  /** @type {TableConfig} */
  static TABLE_CONFIG = {
    cssClass: 'ability-table',
    getItems: AbilityTableRenderer.#getItems,
    renderDescription: CommonDescriptions.descriptionWithTags(
      AbilityTableRenderer.#getTags
    ),
    columns: {
      name: CommonColumns.itemNameColumn({ columnName: 'TYPES.Item.ability' }),
      effect: CommonColumns.textColumn({
        columnLabel: 'DASU.Item.Ability.Effect',
        getText: AbilityTableRenderer.#formatEffect,
      }),
      cost: CommonColumns.htmlColumn({
        columnLabel: 'DASU.Item.Ability.Cost',
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
      toHit: CommonColumns.textColumn({
        columnLabel: 'DASU.Actor.Stat.Hit.abbr',
        getText: (item) =>
          item.system.isInfinity ? '∞' : item.system.toHit ?? '-',
      }),
      aptitude: CommonColumns.textColumn({
        columnLabel: 'DASU.Item.Ability.Aptitude',
        getText: AbilityTableRenderer.#formatAptitude,
      }),
      controls: CommonColumns.itemControlsColumn({
        type: 'ability',
        label: 'TYPES.Item.ability',
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
    return (document.itemTypes.ability ?? []).filter((i) => !exclude.has(i.id));
  }

  static #formatEffect(item) {
    const category = item.system.category;

    if (category === 'restorative') {
      const h = item.system.heal;
      if (h?.mode === 'tick') {
        const attr = game.i18n
          .localize(DASU.attributeAbbreviations[h.attribute] ?? '')
          .toUpperCase();
        return `${attr}+${h.value ?? 0} ${h.resourceLabel ?? ''}`.trim();
      }
      const val = h?.value ?? 0;
      if (!val) return '-';
      const suffix = h?.mode === 'percent' ? '%' : '';
      return `${val}${suffix} ${h?.resourceLabel ?? ''}`.trim();
    }

    if (category === 'affliction') {
      return item.system.isInfinity ? '∞' : '-';
    }

    const d = item.system.damage;
    const val = d?.value ?? 0;
    const label = d?.typeLabel ?? '';
    if (!val && !label) return '-';
    return `${val} ${label}`.trim();
  }

  static #formatAptitude(item) {
    const aptitude = item.system.aptitude;
    const type = game.i18n
      .localize(DASU.aptitudeAbbreviations[aptitude?.type] ?? '')
      .toUpperCase();
    if (!type) return aptitude?.value ?? '';
    if (aptitude?.type === 'assist') return type;
    return `${type}-${aptitude?.value ?? ''}`;
  }

  static #getTags(item) {
    const category = item.system.category;
    const tags = [
      {
        label: 'DASU.Item.Ability.Category',
        value: game.i18n.localize(DASU.abilityCategories[category] ?? ''),
      },
      {
        label: 'DASU.Item.Ability.Aptitude',
        value: AbilityTableRenderer.#formatAptitude(item),
      },
    ];

    if (item.system.toHit !== undefined && !item.system.isInfinity) {
      tags.push({ label: 'DASU.Item.Ability.ToHit', value: item.system.toHit });
    }

    if (category === 'restorative') {
      const h = item.system.heal;
      const valueLabel =
        h?.mode === 'tick'
          ? `${game.i18n
              .localize(DASU.attributeAbbreviations[h.attribute] ?? '')
              .toUpperCase()}+${h.value ?? 0}`
          : `${h?.value ?? 0}${h?.mode === 'percent' ? '%' : ''}`;
      tags.push({
        label: 'DASU.Item.Ability.Heal',
        value: `${valueLabel} ${h?.resourceLabel ?? ''}`.trim(),
      });
      tags.push({
        label: 'DASU.Item.Ability.HealMode',
        value: game.i18n.localize(DASU.itemEffectModes[h?.mode] ?? ''),
      });
    } else if (category === 'affliction' && item.system.isInfinity) {
      tags.push({ label: 'DASU.Item.Ability.IsInfinity', value: '∞' });
    } else if (category === 'spell' || category === 'technique') {
      tags.push({
        label: 'DASU.Item.Ability.Damage',
        value: `${item.system.damage?.value ?? 0} ${
          item.system.damage?.typeLabel ?? ''
        }`.trim(),
      });
    }

    return tags;
  }
}
