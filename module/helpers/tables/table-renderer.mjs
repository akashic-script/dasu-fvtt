/**
 * Base class for all DASU item table renderers.
 *
 * TODO: restore PseudoItem deeply-nested parentage logic when pseudo-items are added.
 * TODO: 'actor' tablePreset is reserved for future party sheet use.
 *
 * @typedef TableConfig
 * @template {Object} D  the document of the sheet being rendered
 * @template {Object} T  the type of the items in the table
 * @property {string | (() => string)} cssClass
 * @property {string} id  unique identifier for the table
 * @property {"item" | "effect" | "custom" | "compendium-item"} [tablePreset="item"]
 * @property {(document: D, options: DASURenderOptions) => T[]} getItems
 * @property {boolean | ((a: T, b: T) => number)} [sort=true]
 * @property {(element: HTMLElement) => void} activateListeners
 * @property {boolean} [hideIfEmpty=false]
 * @property {((item: T) => string | Promise<string>)} [renderDescription]
 * @property {string | (() => string | Promise<string>)} [renderRowCaption]
 * @property {Record<string, ColumnConfig<T>>} columns
 * @property {Record<string, ((event: PointerEvent, target: HTMLElement) => void)>} actions
 * @property {DragDropConfiguration[]} [dragDrop]
 * @property {AdvancedTableConfig<T>} [advancedConfig]
 *
 * @typedef ColumnConfig
 * @template T
 * @property {boolean} [hideHeader]
 * @property {number} [headerSpan]
 * @property {"start" | "center" | "end"} [headerAlignment]
 * @property {string | (() => string | Promise<string>)} [renderHeader]
 * @property {string | ((item: T) => string | Promise<string>)} renderCell
 *
 * @typedef AdvancedTableConfig
 * @template T
 * @property {(item: T) => string | number} getKey
 * @property {string} [keyDataAttribute]
 * @property {AdditionalRowAttribute<T>[]} additionalRowAttributes
 * @property {string} tableClass
 * @property {string} rowClass
 * @property {boolean} draggable
 *
 * @typedef RowData
 * @template T
 * @property {string} key
 * @property {T} item
 * @property {Object} additionalAttributes
 *
 * @template T
 * @typedef AdditionalRowAttribute
 * @property {string} attributeName
 * @property {(item: T) => string} getAttributeValue
 *
 * @typedef DASURenderOptions
 * @property {boolean} [hideIfEmpty]
 * @property {(item: T) => boolean} [isVisible]
 */

import { refreshSlottedTags } from '../tag-slotting.mjs';

export class DASUTableRenderer {
  /** @type {TableConfig} */
  static TABLE_CONFIG = {
    actions: {
      rollItem: DASUTableRenderer.#onRollItem,
      editItem: DASUTableRenderer.#onEditItem,
      deleteItem: DASUTableRenderer.#onDeleteItem,
      createItem: DASUTableRenderer.#onCreateItem,
      browseCompendium: DASUTableRenderer.#onBrowseCompendium,
      menuItem: DASUTableRenderer.#onMenuItem,
    },
  };

  #tableConfig;
  #tableId;
  #application = null;
  #document = null;
  #expandedItems = {};
  #clickHandler = this.#onClick.bind(this);
  #auxClickHandler = this.#onAuxClick.bind(this);

  constructor(overrides = {}) {
    const configurations = [];
    let cls = this.constructor;
    while (cls && cls !== Function.prototype) {
      if (Object.hasOwn(cls, 'TABLE_CONFIG'))
        configurations.unshift(cls.TABLE_CONFIG);
      if (cls === DASUTableRenderer) break;
      cls = Object.getPrototypeOf(cls);
    }

    const config = {};
    for (const src of configurations) {
      for (const [key, value] of Object.entries(src)) {
        if (key === 'actions' || key === 'columns') {
          config[key] = Object.assign(config[key] ?? {}, value);
        } else if (key === 'dragDrop' && Array.isArray(value)) {
          config.dragDrop = [...(config.dragDrop ?? []), ...value];
        } else {
          config[key] = value;
        }
      }
    }

    config.getItems = config.getItems?.bind(this);
    if (config.sort instanceof Function) {
      config.sort = config.sort.bind(this);
    } else if (!('sort' in config) || config.sort === true) {
      config.sort = (a, b) => a.sort - b.sort;
    }
    if (config.renderDescription instanceof Function) {
      config.renderDescription = config.renderDescription.bind(this);
    }
    if (config.renderRowCaption instanceof Function) {
      config.renderRowCaption = config.renderRowCaption.bind(this);
    }

    const boundColumns = {};
    for (const [key, column] of Object.entries(config.columns ?? {})) {
      boundColumns[key] = {
        ...column,
        renderHeader:
          column.renderHeader instanceof Function
            ? column.renderHeader.bind(this)
            : column.renderHeader,
        renderCell:
          column.renderCell instanceof Function
            ? column.renderCell.bind(this)
            : column.renderCell,
      };
    }
    config.columns = boundColumns;

    const boundActions = {};
    for (const [action, handler] of Object.entries(config.actions ?? {})) {
      boundActions[action] =
        handler instanceof Function ? handler.bind(this) : handler;
    }
    config.actions = boundActions;

    config.dragDrop = (config.dragDrop ?? []).map((dragDropConfig) => {
      const dd = { ...dragDropConfig };
      dd.permissions = {};
      for (const [k, v] of Object.entries(dragDropConfig.permissions ?? {})) {
        dd.permissions[k] = v.bind(this);
      }
      dd.callbacks = {};
      for (const [k, v] of Object.entries(dragDropConfig.callbacks ?? {})) {
        dd.callbacks[k] = v.bind(this);
      }
      return new foundry.applications.ux.DragDrop.implementation(dd);
    });

    config.tablePreset ??= 'item';
    switch (config.tablePreset) {
      case 'item': {
        config.advancedConfig = {
          getKey: (item) => item.uuid,
          keyDataAttribute: 'data-uuid',
          additionalRowAttributes: [
            {
              attributeName: 'data-item-id',
              getAttributeValue: (item) => item.id,
            },
          ],
          tableClass: 'item-list',
          rowClass: 'item',
          draggable: true,
        };
        break;
      }

      case 'actor': {
        // TODO: reserved for party sheet use.
        config.advancedConfig = {
          getKey: (entry) => entry.uuid,
          keyDataAttribute: 'data-uuid',
          additionalRowAttributes: [
            {
              attributeName: 'data-actor-id',
              getAttributeValue: (entry) => entry.id,
            },
          ],
          tableClass: 'item-list',
          rowClass: 'item',
          draggable: true,
        };
        break;
      }

      case 'compendium-item': {
        config.advancedConfig = {
          getKey: (item) => item.uuid,
          keyDataAttribute: 'data-uuid',
          additionalRowAttributes: [],
          tableClass: 'item-list',
          rowClass: 'item',
          draggable: false,
        };
        break;
      }

      case 'effect': {
        config.advancedConfig = {
          getKey: (effect) => effect.uuid,
          keyDataAttribute: 'data-uuid',
          additionalRowAttributes: [
            {
              attributeName: 'data-effect-id',
              getAttributeValue: (effect) => effect.id,
            },
          ],
          tableClass: '',
          rowClass: '',
          draggable: false,
        };
        break;
      }

      default: {
        const advancedConfig = { ...config.advancedConfig };
        config.advancedConfig = advancedConfig;

        advancedConfig.getKey = advancedConfig.getKey.bind(this);

        advancedConfig.keyDataAttribute ??= 'data-key';
        if (!advancedConfig.keyDataAttribute.startsWith('data-')) {
          advancedConfig.keyDataAttribute = `data-${advancedConfig.keyDataAttribute}`;
        }

        advancedConfig.additionalRowAttributes = (
          advancedConfig.additionalRowAttributes ?? []
        ).map((value) => ({
          ...value,
          getAttributeValue: value.getAttributeValue.bind(this),
        }));

        advancedConfig.tableClass ??= '';
        advancedConfig.rowClass ??= '';
        advancedConfig.draggable ??= false;
        break;
      }
    }

    Object.assign(config, overrides);
    this.#tableId = config.id ?? foundry.utils.randomID();
    this.initializeOptions(config);
    this.#tableConfig = foundry.utils.deepFreeze(config);
  }

  /**
   * @return {Omit<TableConfig, "dragDrop"> & {dragDrop: DragDrop[]}}
   */
  get tableConfig() {
    return this.#tableConfig;
  }

  /**
   * @return {foundry.applications.api.Application}
   */
  get application() {
    return this.#application;
  }

  /**
   * The document this table was last rendered for. Available during render,
   * before `activateListeners` sets `#application`.
   * @return {Document|null}
   */
  get document() {
    return this.#application?.document ?? this.#document;
  }

  /**
   * @returns {String}
   */
  get id() {
    return this.#tableId;
  }

  /** Hook for subclasses to post-process the merged config before it is frozen. */
  initializeOptions(config) {}

  /**
   * Embedded item ids that are the un-slotted original of a grant choice and must
   * be hidden. The slot copy (tracked via `choice.itemId`) is the canonical one.
   * @param {Actor} actor
   * @returns {Set<string>}
   */
  static slotOriginalIds(actor) {
    const choices = actor?.getFlag?.('dasu', 'advancementChoices') ?? {};
    const ids = new Set();
    for (const choice of Object.values(choices)) {
      const m = choice?.sourceUuid?.match(/Item\.([^.]+)$/);
      if (m && m[1] !== choice.itemId && actor.items?.get(m[1])) ids.add(m[1]);
    }
    return ids;
  }

  static #onRollItem(event, target) {
    event.preventDefault();
    event.stopPropagation();
    const actor = this.#application?.document;
    const li = target.closest('[data-item-id]');
    const { item } = DASUTableRenderer.#resolveTableItem(
      actor,
      li?.dataset?.itemId
    );
    item?.roll?.();
  }

  /**
   * @param {Actor} actor
   * @param {string} itemId
   * @returns {{ item: Item|null, isGrant: boolean }}
   */
  static #resolveTableItem(actor, itemId) {
    if (!itemId) return { item: null, isGrant: false };
    const item = actor?.items?.get(itemId);
    if (!item) return { item: null, isGrant: false };
    const isGrant = !!item.getFlag?.('dasu', 'slotCopy');
    return { item, isGrant };
  }

  static #onEditItem(event, target) {
    event.stopPropagation();
    const actor = this.#application?.document;
    const li = target.closest('[data-item-id]');
    const { item } = DASUTableRenderer.#resolveTableItem(
      actor,
      li?.dataset?.itemId
    );
    item?.sheet?.render(true);
  }

  static async #onDeleteItem(event, target) {
    event.stopPropagation();
    const actor = this.#application?.document;
    const li = target.closest('[data-item-id]');
    const { item, isGrant } = DASUTableRenderer.#resolveTableItem(
      actor,
      li?.dataset?.itemId
    );
    if (!item || isGrant) return;
    await item.delete({ dasuForce: true });
  }

  static #onMenuItem(event, target) {
    event.preventDefault();
    event.stopPropagation();
    const actor = this.#application?.document;
    const li = target.closest('[data-item-id]');
    const { item, isGrant } = DASUTableRenderer.#resolveTableItem(
      actor,
      li?.dataset?.itemId
    );
    if (!item) return;
    const items = [
      {
        label: game.i18n.localize('DASU.Sheet.EditItem'),
        icon: 'fas fa-edit',
        onClick: () => item.sheet.render(true),
      },
      // A catalog tag can push its current state onto its slotted copies,
      // which are otherwise one-time snapshots.
      ...(item.type === 'tag' && item.parent instanceof Actor
        ? [
            {
              label: game.i18n.localize('DASU.Tag.RefreshSlotted'),
              icon: 'fas fa-rotate',
              onClick: async () => {
                const count = await refreshSlottedTags(item);
                ui.notifications?.info(
                  game.i18n.format('DASU.Tag.RefreshedSlotted', {
                    name: item.name,
                    count,
                  })
                );
              },
            },
          ]
        : []),
      // Delete is suppressed for pseudo-items, managed via the class advancement slot.
      ...(!isGrant
        ? [
            {
              label: game.i18n.localize('DASU.Sheet.DeleteItem'),
              icon: 'fas fa-trash',
              onClick: () => item.delete({ dasuForce: true }),
            },
          ]
        : []),
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

  static async #onCreateItem(event, target) {
    event.preventDefault();
    const type = target.dataset.type;
    if (!type) return;
    const data = foundry.utils.deepClone(target.dataset);
    delete data.type;
    delete data.action;
    return Item.create(
      {
        name: game.i18n.format('DOCUMENT.New', { type: type.capitalize() }),
        type,
        system: data,
      },
      { parent: this.#application?.document }
    );
  }

  static async #onBrowseCompendium(event, target) {
    event.preventDefault();
    const id = target.dataset.compendium;
    if (!id) return;
    const pack = game.packs.get(id) ?? game.packs.get(`dasu.${id}`);
    return pack?.render(true);
  }

  /**
   * @param {Document} document
   * @param {DASURenderOptions} [options]
   * @return {Promise<string>}
   */
  async renderTable(document, options = {}) {
    this.#document = document;
    const columns = {};
    const rowCaptions = {};
    const descriptions = {};
    const rowCssClasses = {};
    const rowTooltips = {};

    const {
      getItems,
      sort,
      columns: columnConfigs = {},
      cssClass,
      renderDescription,
      renderRowCaption,
      hideIfEmpty: configHideIfEmpty,
      defaultExpanded,
      advancedConfig,
    } = this.tableConfig;

    const items = await getItems(document, options);

    let shouldHideIfEmpty = configHideIfEmpty ?? false;
    if (options.hideIfEmpty != null) shouldHideIfEmpty = options.hideIfEmpty;
    if (shouldHideIfEmpty && items.length === 0) return '';

    if (sort instanceof Function) items.sort(sort);

    const rowCaptionRenderer =
      renderRowCaption instanceof Function
        ? renderRowCaption
        : () => renderRowCaption;
    const descriptionRenderer =
      renderDescription instanceof Function
        ? renderDescription
        : () => renderDescription;

    for (const [columnKey, columnConfig] of Object.entries(columnConfigs)) {
      columns[columnKey] = {
        hideHeader: columnConfig.hideHeader || !columnConfig.renderHeader,
        headerSpan: columnConfig.headerSpan,
        headerAlignment: columnConfig.headerAlignment ?? 'center',
        header:
          columnConfig.renderHeader instanceof Function
            ? columnConfig.renderHeader()
            : columnConfig.renderHeader,
        cells: {},
      };
    }

    const rows = [];
    for (const item of items) {
      const rowKey = advancedConfig.getKey(item);
      const visible = options.isVisible ? options.isVisible(item) : true;

      // Seed only unseen keys so a user collapse still persists.
      if (defaultExpanded && !(rowKey in this.#expandedItems)) {
        this.#expandedItems[rowKey] = true;
      }

      // TODO (PseudoItem): walk item.parent chain here to set rowCssClasses/rowTooltips.
      for (const [columnKey, columnConfig] of Object.entries(columnConfigs)) {
        columns[columnKey].cells[rowKey] =
          columnConfig.renderCell instanceof Function
            ? columnConfig.renderCell(item)
            : columnConfig.renderCell;
      }
      rowCaptions[rowKey] = rowCaptionRenderer(item);
      descriptions[rowKey] = descriptionRenderer(item);

      const additionalAttributes = {};
      for (const {
        attributeName,
        getAttributeValue,
      } of advancedConfig.additionalRowAttributes) {
        additionalAttributes[attributeName] = getAttributeValue(item);
      }
      rows.push({ key: rowKey, item, visible, additionalAttributes });
    }

    for (const column of Object.values(columns)) {
      column.header = await column.header;
      for (const [key, cellValue] of Object.entries(column.cells)) {
        column.cells[key] = await cellValue;
      }
    }
    for (const [key, value] of Object.entries(rowCaptions))
      rowCaptions[key] = await value;
    for (const [key, value] of Object.entries(descriptions))
      descriptions[key] = await value;

    const { sectionBadge } = options;
    let badge = null;
    if (sectionBadge) {
      const { type, tooltip, used, max } = sectionBadge;
      badge = {
        type: type ?? null,
        text: max != null ? `${used}/${max}` : String(used),
        tooltip: tooltip ?? null,
      };
    }

    return foundry.applications.handlebars.renderTemplate(
      'systems/dasu/templates/table/dasu-table.hbs',
      {
        tableId: this.#tableId,
        config: advancedConfig,
        items: rows,
        cssClass: cssClass instanceof Function ? cssClass() : cssClass,
        columns,
        rowCssClasses,
        rowTooltips,
        rowCaptions,
        descriptions,
        expandedItems: this.#expandedItems,
        badge,
      }
    );
  }

  /**
   * @param {foundry.applications.api.DocumentSheetV2} application
   */
  activateListeners(application) {
    this.#application = application;

    const renderHookId = Hooks.on('renderApplicationV2', (app, element) => {
      if (app !== this.#application) return;
      const tables = element.querySelectorAll(
        `.dasu-table[data-table-id="${this.#tableId}"]`
      );
      tables.forEach((table) => {
        table.addEventListener('click', this.#clickHandler);
        table.addEventListener('contextmenu', this.#clickHandler);
        table.addEventListener('auxclick', this.#auxClickHandler);
        this.tableConfig.dragDrop.forEach((dragDrop) => dragDrop.bind(table));
      });
    });

    const closeHookId = Hooks.on('closeApplicationV2', (app) => {
      if (app !== this.#application) return;
      Hooks.off('renderApplicationV2', renderHookId);
      Hooks.off('closeApplicationV2', closeHookId);
    });
  }

  #onClick(event) {
    const table = event.target.closest(`[data-table-id="${this.#tableId}"]`);
    if (!table) return;

    const row = event.target.closest('.dasu-table__row-container[data-key]');
    const actionElement = event.target.closest('[data-action]');
    const contextMenuTrigger = event.target.closest('[data-context-menu]');

    if (event.type === 'contextmenu' && row) {
      event.preventDefault();
      event.stopPropagation();
      DASUTableRenderer.#onMenuItem.call(this, event, row);
      return;
    }

    const inExpandZone = event.target.closest('.dasu-table__row-expand');
    if (
      event.button === 0 &&
      row &&
      !actionElement &&
      !contextMenuTrigger &&
      !inExpandZone
    ) {
      const rowKey = row.dataset.key;
      const expand = row.querySelector('.dasu-table__row-expand');
      if (expand) {
        this.#expandedItems[rowKey] = expand.classList.toggle(
          'dasu-table__row-expand--visible'
        );
      }
      return;
    }

    const { actions } = this.tableConfig;
    if (actions && actionElement && actionElement.dataset.action in actions) {
      event.preventDefault();
      event.stopPropagation();
      actions[actionElement.dataset.action](event, actionElement);
    }
  }

  #onAuxClick(event) {
    if (event.button !== 1) return;
    const table = event.target.closest(`[data-table-id="${this.#tableId}"]`);
    if (!table) return;
    const row = event.target.closest('.dasu-table__row-container[data-key]');
    if (!row) return;
    event.preventDefault();
    const item = fromUuidSync(row.dataset.key);
    if (item) item.sheet.render(true);
  }
}
