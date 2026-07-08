import { DASUTableRenderer } from './table-renderer.mjs';
import { CommonColumns } from './common-columns.mjs';
import { resistanceChips } from './resistance-display.mjs';

/**
 * @typedef StockEntry
 * @property {string} uuid    - daemon actor UUID from system.stock
 * @property {boolean} active - whether the daemon is in the active slot
 * @property {Actor|null} actor - resolved actor (null if not found)
 * @property {number} index   - index in system.stock array, used as key
 */

export class StockTableRenderer extends DASUTableRenderer {
  /** @param {'active'|'inactive'} slot */
  constructor(slot) {
    super();
    this._slot = slot;
  }

  static TABLE_CONFIG = {
    tablePreset: 'custom',
    cssClass: 'stock-table',
    sort: false,
    advancedConfig: {
      getKey: (entry) => String(entry.index),
      keyDataAttribute: 'data-stock-index',
      additionalRowAttributes: [
        {
          attributeName: 'data-uuid',
          getAttributeValue: (entry) => entry.uuid,
        },
        {
          attributeName: 'data-stock-index',
          getAttributeValue: (entry) => String(entry.index),
        },
      ],
      tableClass: 'item-list',
      rowClass: 'item',
      draggable: false,
    },
    columns: {
      name: {
        renderHeader: () => game.i18n.localize('TYPES.Actor.daemon'),
        headerAlignment: 'start',
        renderCell: StockTableRenderer.#renderNameCell,
      },
      avoid: CommonColumns.textColumn({
        columnLabel: 'DASU.Actor.Stat.Avoid.abbr',
        getText: (entry) => entry.actor?.system?.stats?.avoid?.value ?? '?',
      }),
      defense: CommonColumns.textColumn({
        columnLabel: 'DASU.Actor.Stat.Defense.abbr',
        getText: (entry) => entry.actor?.system?.stats?.defense?.value ?? '?',
      }),
      strain: CommonColumns.textColumn({
        columnLabel: 'DASU.Actor.Stat.Strain.abbr',
        getText: (entry) => entry.actor?.system?.strain?.value ?? '?',
      }),
      controls: {
        hideHeader: true,
        renderCell: StockTableRenderer.#renderControlsCell,
      },
    },
    renderDescription: StockTableRenderer.#renderDescription,
    actions: {
      stockToggle: StockTableRenderer.#onToggle,
      stockChannel: StockTableRenderer.#onChannel,
      stockMenu: StockTableRenderer.#onMenu,
    },
  };

  static async #renderNameCell(entry) {
    const actor = entry.actor;
    const name = actor?.name ?? entry.uuid;
    const img = actor?.img ?? 'icons/svg/mystery-man.svg';
    return foundry.applications.handlebars.renderTemplate(
      'systems/dasu/templates/table/cell/cell-item-name.hbs',
      {
        name,
        img,
        uuid: entry.uuid,
        rollable: false,
        caption: null,
        cssClass: null,
      }
    );
  }

  static async #renderControlsCell(entry) {
    const toggleIcon = entry.active ? 'fa-circle-dot' : 'fa-circle';
    const toggleLabel = entry.active
      ? game.i18n.localize('DASU.Stock.SetInactive')
      : game.i18n.localize('DASU.Stock.SetActive');
    // Channelers get a channel toggle first in the row, separate from the active
    // layer. On/off is shown via the --active highlight (the icon has no regular
    // variant); matches the combat tracker's channeled indicator.
    let channelBtn = '';
    if (entry.isChanneler) {
      const channelLabel = entry.channeled
        ? game.i18n.localize('DASU.Stock.StopChannel')
        : game.i18n.localize('DASU.Stock.Channel');
      const channelCls = entry.channeled
        ? ' cell-item-controls__control--active'
        : '';
      channelBtn = `<a class="cell-item-controls__control${channelCls}" data-action="stockChannel" data-tooltip="${channelLabel}"><i class="fa-solid fa-hand-sparkles"></i></a>`;
    }
    return `<div class="cell-item-controls">
      ${channelBtn}
      <a class="cell-item-controls__control" data-action="stockToggle" data-tooltip="${toggleLabel}"><i class="fa-regular ${toggleIcon}"></i></a>
      <a class="cell-item-controls__control" data-action="stockMenu" data-tooltip="${game.i18n.localize(
        'DASU.Sheet.MoreOptions'
      )}"><i class="fas fa-bars"></i></a>
    </div>`;
  }

  static async #onToggle(event, target) {
    const li = target.closest('[data-stock-index]');
    const index = Number(li?.dataset?.stockIndex);
    const actor = this.document;
    if (!actor) return;
    const stock = foundry.utils.deepClone(actor.system.stock ?? []);
    if (!stock[index]) return;
    const activating = !stock[index].active;
    stock[index].active = activating;
    // An inactive daemon cannot be channeled; drop the channel when it leaves the field.
    if (!activating) stock[index].channeled = false;
    await actor.update({ 'system.stock': stock });

    // Fielding a daemon may exceed the summoner's Will Strain Cap; warn but allow.
    if (activating) {
      const cap = actor.system.willStrain?.cap ?? 0;
      const used = stock
        .filter((e) => e.active)
        .reduce(
          (sum, e) => sum + (fromUuidSync(e.uuid)?.system?.strain?.value ?? 0),
          0
        );
      if (used > cap) {
        ui.notifications?.warn(
          game.i18n.format('DASU.Stock.OverStrain', { used, cap })
        );
      }
    }
  }

  // Channelers channel one daemon at a time, a layer separate from Will Strain.
  static async #onChannel(event, target) {
    const li = target.closest('[data-stock-index]');
    const index = Number(li?.dataset?.stockIndex);
    const actor = this.document;
    if (!actor) return;
    const stock = foundry.utils.deepClone(actor.system.stock ?? []);
    if (!stock[index]) return;
    const channeling = !stock[index].channeled;
    // Channeling an inactive daemon also fields it; a daemon can't be channeled off-field.
    if (channeling) {
      stock[index].active = true;
      // Only one daemon may be channeled; clear any other before setting this one.
      for (const e of stock) e.channeled = false;
    }
    stock[index].channeled = channeling;
    await actor.update({ 'system.stock': stock });
  }

  static async #renderDescription(entry) {
    const actor = entry.actor;
    if (!actor) return '';
    const sys = actor.system;
    const resistances = resistanceChips(sys);
    const meritsTooltip = game.i18n.format('DASU.Actor.Merit.ToTransform', {
      count: sys.meritProgress?.toNext ?? 0,
    });
    return foundry.applications.handlebars.renderTemplate(
      'systems/dasu/templates/table/expand/expand-stock-daemon.hbs',
      {
        resources: sys.resources,
        stats: sys.stats,
        merit: sys.merit,
        meritsTooltip,
        resistances,
      }
    );
  }

  static #onMenu(event, target) {
    const li = target.closest('[data-stock-index]');
    const index = Number(li?.dataset?.stockIndex);
    const actor = this.document;
    if (!actor) return;
    const entry = actor.system.stock?.[index];
    if (!entry) return;
    const resolved = fromUuidSync(entry.uuid);
    const items = [
      ...(resolved
        ? [
            {
              label: game.i18n.localize('DASU.Sheet.EditItem'),
              icon: 'fas fa-edit',
              onClick: () => resolved.sheet?.render(true),
            },
          ]
        : []),
      {
        label: game.i18n.localize('DASU.Sheet.DeleteItem'),
        icon: 'fas fa-trash',
        onClick: async () => {
          const stock = foundry.utils.deepClone(actor.system.stock ?? []);
          stock.splice(index, 1);
          await actor.update({ 'system.stock': stock });
        },
      },
    ];
    ui.context?.close();
    const menu = new foundry.applications.ux.ContextMenu(
      document.body,
      null,
      items,
      {
        jQuery: false,
        fixed: true,
        relative: 'target',
      }
    );
    setTimeout(() => {
      ui.context = menu;
      menu.render(target, { event });
    }, 0);
  }

  async getItems(document) {
    const slot = this._slot;
    const isChanneler = !!document.system.isChanneler;
    return (document.system.stock ?? [])
      .map((entry, index) => ({
        ...entry,
        index,
        isChanneler,
        actor: fromUuidSync(entry.uuid) ?? null,
      }))
      .filter((entry) => (slot === 'active' ? entry.active : !entry.active));
  }

  initializeOptions(config) {
    config.getItems = this.getItems.bind(this);
    config.cssClass = `stock-table stock-table--${this._slot}`;
  }
}
