import { DASUTableRenderer } from './table-renderer.mjs';
import { CommonColumns } from './common-columns.mjs';
import { CommonDescriptions } from './common-descriptions.mjs';
import { DASU } from '../config.mjs';

export class WeaponTableRenderer extends DASUTableRenderer {
  /** @type {TableConfig} */
  static TABLE_CONFIG = {
    cssClass: 'weapon-table',
    getItems: WeaponTableRenderer.#getItems,
    renderDescription: CommonDescriptions.descriptionWithTags(
      WeaponTableRenderer.#getTags
    ),
    columns: {
      name: CommonColumns.itemNameColumn({ columnName: 'TYPES.Item.weapon' }),
      damage: CommonColumns.textColumn({
        columnLabel: 'DASU.Item.Weapon.Damage',
        getText: (item) => item.system.damage?.value ?? '-',
      }),
      toHit: CommonColumns.textColumn({
        columnLabel: 'DASU.Actor.Stat.Hit.abbr',
        getText: (item) => item.system.toHit ?? '-',
      }),
      controls: CommonColumns.itemControlsColumn({
        type: 'weapon',
        label: 'TYPES.Item.weapon',
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
    return document.itemTypes.weapon ?? [];
  }

  static #getTags(item) {
    return [
      {
        label: 'DASU.Item.Weapon.Category',
        value: game.i18n.localize(
          DASU.weaponCategories[item.system.category] ?? ''
        ),
      },
      {
        label: 'DASU.Item.Weapon.Range',
        value: game.i18n.localize(DASU.weaponRanges[item.system.range] ?? ''),
      },
      {
        label: 'DASU.Item.Weapon.ToHit',
        value: item.system.toHit ?? '-',
      },
      {
        label: 'DASU.Item.Weapon.DamageType',
        value: game.i18n.localize(
          DASU.damageTypes[item.system.damage?.damageType] ?? ''
        ),
      },
      {
        label: 'DASU.Item.Weapon.Price',
        value: item.system.resource?.cost ?? '-',
      },
    ];
  }
}
