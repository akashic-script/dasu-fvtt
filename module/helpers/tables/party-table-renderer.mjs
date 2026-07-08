import { DASUTableRenderer } from './table-renderer.mjs';
import { resistanceChips } from './resistance-display.mjs';

const TEMPLATE = (path) => `systems/dasu/templates/table/${path}.hbs`;

/**
 * Table-layout renderer for the party sheet's Summoners / Roster / Storage
 * tabs. Rows are {@link DASUParty} card-data view models (keyed by actor
 * uuid), not embedded items, so this uses the reserved `actor` table preset
 * with party-specific columns rather than the item-oriented
 * {@link CommonColumns} helpers. The three sections share this class, varying
 * only by `section` (columns/controls shown) and their `getRows` provider.
 */
export class PartyTableRenderer extends DASUTableRenderer {
  /** @type {TableConfig} */
  static TABLE_CONFIG = {
    tablePreset: 'actor',
    sort: false,
    cssClass: 'party-table',
    actions: {
      openActor: PartyTableRenderer.#onOpenActor,
      removeMember: PartyTableRenderer.#delegate('removeMember'),
      toggleActive: PartyTableRenderer.#delegate('toggleActive'),
      toggleChanneled: PartyTableRenderer.#delegate('toggleChanneled'),
      storeDaemon: PartyTableRenderer.#delegate('storeDaemon'),
      claimDaemon: PartyTableRenderer.#delegate('claimDaemon'),
      removeFromStorage: PartyTableRenderer.#delegate('removeFromStorage'),
    },
  };

  /**
   * @param {'summoners'|'roster'|'storage'} section
   * @param {() => object[]} getRows  Provider for this section's card data.
   */
  constructor(section, getRows) {
    super({ _partySection: section, _partyGetRows: getRows });
  }

  initializeOptions(config) {
    const section = config._partySection;
    const getRows = config._partyGetRows;
    delete config._partySection;
    delete config._partyGetRows;

    config.id = `party-${section}`;
    // Section-specific class so each gets its own grid-template-columns (the
    // three sections have different column sets); see css `.party-table--*`.
    config.cssClass = `party-table party-table--${section}`;
    config.getItems = (document, options) => {
      const rows = getRows() ?? [];
      return options?.isVisible ? rows.filter(options.isVisible) : rows;
    };
    config.columns = PartyTableRenderer.#columnsFor(section);

    // Second rows per actor: an always-visible stats caption (HP/WP + combat
    // stats) and a click-to-expand resistances row, mirroring the stock table.
    config.renderRowCaption = (row) => PartyTableRenderer.#renderStats(row);
    config.renderDescription = (row) =>
      PartyTableRenderer.#renderResistances(row);

    // Key the row off the uuid view-model field. `dasu-table.hbs` only emits
    // `data-key`, so also expose `data-uuid` (and `data-actor-id`) explicitly:
    // the party sheet's drag selector and action handlers resolve rows via
    // `closest('[data-uuid]')`, matching the card layout.
    config.advancedConfig.getKey = (row) => row.uuid;
    config.advancedConfig.additionalRowAttributes = [
      { attributeName: 'data-uuid', getAttributeValue: (row) => row.uuid },
      {
        attributeName: 'data-actor-id',
        getAttributeValue: (row) => row.actor.id,
      },
    ];
    if (section === 'roster') {
      config.advancedConfig.additionalRowAttributes.push({
        attributeName: 'data-owner-uuid',
        getAttributeValue: (row) => row.ownerUuid,
      });
    }
    config.advancedConfig.rowClass = 'party-card party-table__row';
    config.advancedConfig.draggable = true;
  }

  // Static so they can run from the base-class constructor (via
  // initializeOptions) before the subclass's private instance members exist.
  static #columnsFor(section) {
    const name = {
      renderHeader: () => game.i18n.localize('DASU.Party.ColName'),
      headerAlignment: 'start',
      renderCell: (row) =>
        foundry.applications.handlebars.renderTemplate(
          TEMPLATE('cell/cell-actor-name'),
          row
        ),
    };
    const controls = {
      // Empty but present header so the controls column keeps its grid slot
      // (a hidden header would desync the subgrid from the row cells).
      renderHeader: () => '&nbsp;',
      headerAlignment: 'end',
      renderCell: (row) =>
        foundry.applications.handlebars.renderTemplate(
          TEMPLATE('cell/cell-party-controls'),
          { ...row, [section]: true }
        ),
    };

    if (section === 'summoners') {
      return {
        name,
        level: PartyTableRenderer.#textColumn(
          'DASU.Party.ColLevel',
          (row) => row.level
        ),
        class: PartyTableRenderer.#textColumn(
          'DASU.Party.ColClass',
          (row) => row.className || game.i18n.localize('DASU.Party.Classless')
        ),
        controls,
      };
    }
    if (section === 'roster') {
      return {
        name,
        owner: PartyTableRenderer.#textColumn(
          'DASU.Party.ColOwner',
          (row) => row.ownerName
        ),
        controls,
      };
    }
    return { name, controls };
  }

  static #textColumn(label, getText) {
    return {
      renderHeader: () => game.i18n.localize(label),
      renderCell: (row) =>
        foundry.applications.handlebars.renderTemplate(
          TEMPLATE('cell/cell-text'),
          { text: '' + getText(row), alignment: 'center', importance: 'normal' }
        ),
    };
  }

  /** Always-visible caption row: HP/WP plus combat stats for the actor. */
  static #renderStats(row) {
    const sys = row.actor?.system;
    if (!sys) return '';
    const meritsTooltip = game.i18n.format('DASU.Actor.Merit.ToTransform', {
      count: sys.meritProgress?.toNext ?? 0,
    });
    return foundry.applications.handlebars.renderTemplate(
      TEMPLATE('caption/caption-party-stats'),
      {
        resources: sys.resources,
        stats: sys.stats,
        merit: sys.merit,
        meritsTooltip,
      }
    );
  }

  /** Collapsible expand row: the actor's resistance chips. */
  static #renderResistances(row) {
    const sys = row.actor?.system;
    if (!sys) return '';
    return foundry.applications.handlebars.renderTemplate(
      TEMPLATE('expand/expand-party-resistances'),
      { resistances: resistanceChips(sys) }
    );
  }

  /** Row action that forwards to the owning party sheet's action handler. */
  static #delegate(action) {
    return function (event, target) {
      const sheet = this.application;
      const handler = sheet?.constructor?.DEFAULT_OPTIONS?.actions?.[action];
      handler?.call(sheet, event, target);
    };
  }

  static #onOpenActor(event, target) {
    const uuid = target.closest('[data-uuid]')?.dataset.uuid;
    fromUuidSync(uuid)?.sheet?.render(true);
  }
}
