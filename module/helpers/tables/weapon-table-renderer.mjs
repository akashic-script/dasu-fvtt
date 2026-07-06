import { DASUTableRenderer } from './table-renderer.mjs';
import { CommonColumns } from './common-columns.mjs';
import { CommonDescriptions } from './common-descriptions.mjs';
import { DASU } from '../config.mjs';
import { toggle as equipToggle } from '../equip-handler.mjs';

export class WeaponTableRenderer extends DASUTableRenderer {
  /** @type {TableConfig} */
  static TABLE_CONFIG = {
    cssClass: 'weapon-table',
    getItems: WeaponTableRenderer.#getItems,
    renderDescription: CommonDescriptions.descriptionWithTags(
      WeaponTableRenderer.#getTags
    ),
    renderRowCaption: CommonDescriptions.slottedTagCaption(),
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
      equip: {
        renderHeader: () => game.i18n.localize('DASU.Equip.ColumnHeader'),
        renderCell: WeaponTableRenderer.#renderEquipCell,
      },
      controls: CommonColumns.itemControlsColumn({
        type: 'weapon',
        label: 'TYPES.Item.weapon',
        disableDelete: (item) => !(item.parent instanceof Actor),
        disableEdit: (item) => !(item.parent instanceof Actor),
      }),
    },
    actions: {
      equipToggle: WeaponTableRenderer.#onEquipToggle,
    },
  };

  initializeOptions(config) {
    config.advancedConfig.additionalRowAttributes.push({
      attributeName: 'data-category',
      getAttributeValue: (item) => item.system.category ?? '',
    });
    config.advancedConfig.additionalRowAttributes.push({
      attributeName: 'data-equipped',
      getAttributeValue: (item) => String(item.system?.isEquipped ?? false),
    });
  }

  static #getItems(document) {
    const exclude = DASUTableRenderer.slotOriginalIds(document);
    return (document.itemTypes.weapon ?? []).filter((i) => !exclude.has(i.id));
  }

  static async #renderEquipCell(item) {
    const equipped = item.system?.isEquipped ?? false;
    const icon = equipped
      ? 'fa-solid fa-shield-halved'
      : 'fa-regular fa-shield';
    const activeCls = equipped ? ' cell-equip-toggle--active' : '';
    const label = equipped
      ? game.i18n.localize('DASU.Equip.Unequip')
      : game.i18n.localize('DASU.Equip.Equip');
    const disabled = !(item.parent instanceof Actor)
      ? ' cell-equip-toggle--disabled'
      : '';
    return `<a class="cell-equip-toggle${activeCls}${disabled}" data-action="equipToggle" data-tooltip="${foundry.utils.escapeHTML(
      label
    )}">
      <i class="${icon}"></i>
    </a>`;
  }

  static async #onEquipToggle(event, target) {
    const li = target.closest('[data-item-id]');
    const itemId = li?.dataset?.itemId;
    const actor = this.document;
    if (!actor || !itemId) return;
    const item = actor.items.get(itemId);
    if (!item) return;
    await equipToggle(actor, item);
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
          DASU.damageTypes[item.system.damage?.type] ?? ''
        ),
      },
      {
        label: 'DASU.Item.Weapon.Price',
        value: item.system.resource?.cost ?? '-',
      },
    ];
  }
}
