/**
 * Shared column factory functions for DASU table renderers.
 *
 * TODO: add progressBarColumn when progress bar mechanic is implemented.
 * TODO: add actorAnchorColumn when party/merchant sheets are implemented.
 *
 * @typedef ItemNameColumnOptions
 * @property {string | (() => string)} [columnName]
 * @property {number} [headerSpan]
 * @property {(item: Item) => string | Promise<string>} [renderCaption]
 * @property {string | ((item: Item) => string)} [cssClass]
 */

const TEMPLATE = (path) => `systems/dasu/templates/table/${path}.hbs`;

/**
 * Name column with image, rollable anchor, and optional caption below the name.
 * @param {ItemNameColumnOptions} [options]
 * @return {ColumnConfig<Item>}
 */
function itemNameColumn(options = {}) {
  const { columnName, headerSpan, renderCaption, cssClass } = options;
  return {
    renderHeader:
      columnName instanceof Function
        ? columnName
        : () => game.i18n.localize(columnName || 'DASU.Name'),
    headerAlignment: 'start',
    headerSpan,
    renderCell: _renderNameCell(renderCaption, cssClass, { rollable: true }),
  };
}

/**
 * Name column without rollable - for compendium or read-only contexts.
 * @param {ItemNameColumnOptions} [options]
 * @return {ColumnConfig<Item>}
 */
function itemAnchorColumn(options = {}) {
  const { columnName, headerSpan, renderCaption, cssClass } = options;
  return {
    renderHeader:
      columnName instanceof Function
        ? columnName
        : () => game.i18n.localize(columnName || 'DASU.Name'),
    headerAlignment: 'start',
    headerSpan,
    renderCell: _renderNameCell(renderCaption, cssClass, { rollable: false }),
  };
}

/**
 * @param {(item: Item) => string | Promise<string>} [renderCaption]
 * @param {string | ((item: Item) => string)} [cssClass]
 * @param {{ rollable: boolean }} options
 * @return {(item: Item) => Promise<string>}
 */
function _renderNameCell(renderCaption, cssClass, options) {
  const caption =
    renderCaption instanceof Function ? renderCaption : () => renderCaption;
  const getCssClass = cssClass instanceof Function ? cssClass : () => cssClass;
  return async (item) => {
    return foundry.applications.handlebars.renderTemplate(
      TEMPLATE('cell/cell-item-name'),
      {
        name: item.name,
        img: item.img,
        id: item.id,
        uuid: item.uuid,
        rollable: options.rollable,
        caption: await caption(item),
        cssClass: getCssClass(item),
      }
    );
  };
}

/**
 * @typedef ItemControlsColumnOptions
 * @property {string | string[] | (() => string | string[])} [type]   item type(s) for the create button
 * @property {string | (() => string)} [label]                         header label i18n key
 * @property {"start" | "center" | "end"} [headerAlignment]
 * @property {boolean | ((item: Item) => boolean)} [disableEdit]
 * @property {boolean | ((item: Item) => boolean)} [disableMenu]
 * @property {boolean | ((item: Item) => boolean)} [disableDelete]
 */

/**
 * Controls column
 * @param {ItemControlsColumnOptions} [headerOptions]
 * @param {Omit<ItemControlsColumnOptions, "type" | "label" | "headerAlignment">} [cellOptions]
 * @return {ColumnConfig}
 */
function itemControlsColumn(headerOptions = {}, cellOptions = {}) {
  return {
    headerAlignment: headerOptions.headerAlignment,
    renderHeader: _renderControlsHeader(headerOptions),
    renderCell: _renderControls(cellOptions),
  };
}

/**
 * @param {ItemControlsColumnOptions} headerOptions
 * @return {() => Promise<string>}
 */
function _renderControlsHeader(headerOptions) {
  return async function () {
    const options = { ...headerOptions };

    if (options.label instanceof Function)
      options.label = options.label.call(this);

    if (options.type instanceof Function)
      options.type = options.type.call(this);
    if (Array.isArray(options.type)) options.type = options.type.join(',');

    return foundry.applications.handlebars.renderTemplate(
      TEMPLATE('header/header-item-controls'),
      options
    );
  };
}

/**
 * @param {Omit<ItemControlsColumnOptions, "type" | "label" | "headerAlignment">} options
 * @return {(item: Item) => Promise<string>}
 */
function _renderControls(options) {
  const {
    disableEdit = false,
    disableMenu = false,
    disableDelete = false,
  } = options;
  return async function (item) {
    return foundry.applications.handlebars.renderTemplate(
      TEMPLATE('cell/cell-item-controls'),
      {
        isGM: game.user.isGM,
        disableEdit:
          disableEdit instanceof Function
            ? disableEdit.call(this, item)
            : disableEdit,
        disableMenu:
          disableMenu instanceof Function
            ? disableMenu.call(this, item)
            : disableMenu,
        disableDelete:
          disableDelete instanceof Function
            ? disableDelete.call(this, item)
            : disableDelete,
        hideDelete: true,
      }
    );
  };
}

/**
 * @typedef TextColumnOptions
 * @property {string} [columnLabel]   i18n key for the header
 * @property {string} [cssClass]
 * @property {"start" | "center" | "end"} [alignment]
 * @property {"low" | "normal" | "high"} [importance]
 * @property {(item: Item) => string | number | Promise<string | number>} getText
 * @property {string | ((item: Item) => string)} [tooltip]
 */

/**
 * Plain localised text cell.
 * @param {TextColumnOptions} [options]
 * @return {ColumnConfig<Item>}
 */
function textColumn(options = {}) {
  const { cssClass, columnLabel, getText, tooltip, alignment, importance } =
    options;
  return {
    hideHeader: !columnLabel,
    renderHeader: () => game.i18n.localize(columnLabel),
    headerAlignment: alignment,
    renderCell: _renderTextCell(
      getText,
      tooltip,
      alignment,
      importance,
      cssClass
    ),
  };
}

/**
 * @param {(item: Item) => string | number | Promise<string | number>} getText
 * @param {string | ((item: Item) => string)} [tooltip]
 * @param {"start" | "center" | "end"} [alignment]
 * @param {"low" | "normal" | "high"} [importance]
 * @param {string} [cssClass]
 * @return {(item: Item) => Promise<string>}
 */
function _renderTextCell(
  getText,
  tooltip,
  alignment = 'center',
  importance = 'normal',
  cssClass
) {
  return async (item) => {
    return foundry.applications.handlebars.renderTemplate(
      TEMPLATE('cell/cell-text'),
      {
        text: '' + (await getText(item)),
        tooltip: tooltip instanceof Function ? tooltip(item) : tooltip,
        alignment,
        importance,
        cssClass,
      }
    );
  };
}

/**
 * @typedef ResourceColumnOptions
 * @property {string} [columnName]   i18n key for the header
 * @property {"start" | "center" | "end"} [headerAlignment]
 * @property {string} [cssClass]
 * @property {(item: Item) => { current: number, max: number } | null} getResource
 */

/**
 * Current/max resource cell.
 * @param {ResourceColumnOptions} options
 * @return {ColumnConfig}
 */
function resourceColumn(options) {
  const { columnName, headerAlignment, cssClass, getResource } = options;
  return {
    hideHeader: !columnName,
    renderHeader: () => game.i18n.localize(columnName || 'DASU.Resource'),
    headerAlignment,
    renderCell: _renderResourceCell(getResource, cssClass),
  };
}

/**
 * @param {(item: Item) => { current: number, max: number } | null} getResource
 * @param {string} [cssClass]
 * @return {(item: Item) => Promise<string>}
 */
function _renderResourceCell(getResource, cssClass) {
  return async (item) => {
    return foundry.applications.handlebars.renderTemplate(
      TEMPLATE('cell/cell-resource'),
      {
        data: getResource(item),
        cssClass,
      }
    );
  };
}

/**
 * @typedef IfElseColumnOptions
 * @property {string} [columnName]
 * @property {"start" | "center" | "end"} [headerAlignment]
 * @property {(item: Item) => boolean} condition
 * @property {(item: Item) => string | Promise<string>} ifTrue
 * @property {(item: Item) => string | Promise<string>} otherwise
 */

/**
 * Conditional cell - renders one of two cells depending on a predicate.
 * @param {IfElseColumnOptions} options
 * @return {ColumnConfig}
 */
function ifElseColumn(options = {}) {
  const { columnName, headerAlignment, condition, ifTrue, otherwise } = options;
  return {
    hideHeader: !columnName,
    renderHeader: () => game.i18n.localize(columnName),
    headerAlignment,
    renderCell: async (item) =>
      condition(item) ? ifTrue(item) : otherwise(item),
  };
}

export const CommonColumns = Object.freeze({
  itemNameColumn,
  itemAnchorColumn,
  itemControlsColumn,
  textColumn,
  resourceColumn,
  ifElseColumn,
});
