import { SYSTEM } from '../helpers/config.mjs';
import { addDaemonToStock } from '../helpers/daemon-stock.mjs';
import { pruneShownEntries } from './party-directory-tree.mjs';
import { PartyCollapseState } from './party-collapse-state.mjs';

const { ActorDirectory } = foundry.applications.sidebar.tabs;

/**
 * DASU Actors sidebar. Renders `party` actors as pseudo-folders above the
 * normal directory tree - Summoners (system.members), a derived Roster (the
 * union of member stocks), and Storage (system.storage, the party's own
 * unowned daemon pool). Parties and anything already shown inside them are
 * filtered out of the normal document list so an actor appears in exactly
 * one place.
 */
export class DASUActorDirectory extends ActorDirectory {
  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    actions: {
      openParty: DASUActorDirectory.#onOpenParty,
      togglePartySection: DASUActorDirectory.#onToggleSection,
    },
  };

  /** @inheritDoc */
  static PARTS = {
    ...super.PARTS,
    parties: {
      template: `systems/${SYSTEM}/templates/sidebar/party-folders.hbs`,
      scrollable: [''],
    },
  };

  #collapseState = new PartyCollapseState('partySidebarState');

  /** Ids of actors already shown inside a party pseudo-folder. */
  #shownInPartyIds = null;

  /** Registered [hookName, id] pairs for the parties-section live refresh. */
  #refreshHookIds = null;

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const { parties, shownIds } = await this.#prepareParties();
    context.parties = parties;
    this.#shownInPartyIds = shownIds;
    return context;
  }

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (partId === 'directory') {
      context.tree = pruneShownEntries(
        context.tree,
        this.#shownInPartyIds ?? new Set()
      );
    }
    return context;
  }

  /** Build the sidebar view model for every party actor. */
  async #prepareParties() {
    const parties = game.actors.filter((a) => a.type === 'party');
    const shownIds = new Set();
    const built = await Promise.all(
      parties.map(async (party) => {
        const summoners = await party.system.getMemberCardData();
        const roster = await party.system.getRosterCardData();
        const storage = await party.system.getStorageCardData();
        for (const row of [...summoners, ...roster, ...storage]) {
          shownIds.add(row.actor.id);
        }
        return {
          id: party.id,
          uuid: party.uuid,
          name: party.name,
          img: party.img,
          collapsed: this.#collapseState.isCollapsed(party.id),
          summonersCollapsed: this.#collapseState.isCollapsed(
            `${party.id}:summoners`
          ),
          rosterCollapsed: this.#collapseState.isCollapsed(
            `${party.id}:roster`
          ),
          storageCollapsed: this.#collapseState.isCollapsed(
            `${party.id}:storage`
          ),
          summoners,
          roster,
          storage,
        };
      })
    );
    return { parties: built, shownIds };
  }

  /** @inheritDoc */
  render(options = {}) {
    if (
      options.parts?.includes('parties') &&
      !options.parts.includes('directory')
    )
      options.parts.push('directory');
    return super.render(options);
  }

  /** @inheritDoc */
  async _onRender(context, options) {
    if (options.parts.includes('directory')) {
      // Pseudo-folders render as their own part but belong visually above
      // the actor list, so move the rendered node into place.
      const partiesPart = this.parts.parties;
      partiesPart.remove();
      this.parts.directory.prepend(partiesPart);
    }
    await super._onRender(context, options);
    if (options.parts.includes('parties')) {
      this.#bindPartyDragDrop();
    }
    this.#bindLiveRefresh();
  }

  /** Re-render the pseudo-folders whenever party/member/stock data changes. */
  #bindLiveRefresh() {
    if (this.#refreshHookIds) return;
    const refresh = foundry.utils.debounce(() => {
      const partiesEl = this.parts?.parties;
      if (partiesEl) this.#collapseState.syncFromDOM(partiesEl);
      this.render({ parts: ['parties', 'directory'] });
    }, 100);
    this.#refreshHookIds = [
      ['createActor', (a) => a.type === 'party' && refresh()],
      ['deleteActor', (a) => a.type === 'party' && refresh()],
      [
        'updateActor',
        (a, changes) => {
          if (a.type === 'party') return refresh();
          if (
            a.type === 'summoner' &&
            foundry.utils.hasProperty(changes, 'system.stock')
          )
            return refresh();
        },
      ],
    ].map(([hook, fn]) => [hook, Hooks.on(hook, fn)]);
  }

  /** @inheritDoc */
  async _onClose(options) {
    for (const [hook, id] of this.#refreshHookIds ?? []) Hooks.off(hook, id);
    this.#refreshHookIds = null;
    return super._onClose(options);
  }

  /* -------------------------------------------- */
  /*  Drag & Drop                                 */
  /* -------------------------------------------- */

  #bindPartyDragDrop() {
    new foundry.applications.ux.DragDrop.implementation({
      dragSelector: '[data-party] [data-uuid]',
      dropSelector: '[data-party]',
      permissions: {
        dragstart: () => true,
        drop: () => true,
      },
      callbacks: {
        dragstart: (event) => {
          const uuid = event.currentTarget.dataset.uuid;
          if (uuid)
            event.dataTransfer.setData(
              'text/plain',
              JSON.stringify({ type: 'Actor', uuid })
            );
        },
        drop: this.#onDropOnParty.bind(this),
      },
    }).bind(this.element);
  }

  async #onDropOnParty(event) {
    const folder = event.target.closest('[data-party]');
    const partyId = folder?.dataset.partyId;
    const party = partyId ? game.actors.get(partyId) : null;
    if (!party) return;

    event.stopPropagation();

    const data =
      foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (data.type === 'Folder') {
      const sourceFolder = await fromUuid(data.uuid);
      const actors =
        sourceFolder?.type === 'Actor' ? sourceFolder.contents : [];
      for (const actor of actors)
        await this.#dropActorOnParty(party, actor, event);
      return;
    }
    if (data.type !== 'Actor') return;
    const actor = await fromUuid(data.uuid);
    if (actor) await this.#dropActorOnParty(party, actor, event);
  }

  async #dropActorOnParty(party, actor, event) {
    const onRoster = !!event.target.closest('[data-section="roster"]');
    const onStorage = !!event.target.closest('[data-section="storage"]');
    if (actor.type === 'summoner' && !onRoster && !onStorage) {
      return party.system.addMember(actor);
    }
    if (actor.type === 'daemon' && onStorage) {
      await party.system.addToStorage(actor.uuid);
      return true;
    }
    if (actor.type === 'daemon') {
      const members = await party.system.getMembers();
      if (!members.length) {
        ui.notifications?.warn(game.i18n.localize('DASU.Party.MembersEmpty'));
        return false;
      }
      const summoner =
        members.length === 1 ? members[0] : await this.#promptSummoner(members);
      if (!summoner) return false;
      return addDaemonToStock(summoner, actor);
    }
    return false;
  }

  async #promptSummoner(members) {
    return foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize('DASU.Party.PickSummoner') },
      content: `<select name="summoner">${members
        .map((m) => `<option value="${m.uuid}">${m.name}</option>`)
        .join('')}</select>`,
      ok: {
        label: game.i18n.localize('DASU.Party.PickSummoner'),
        callback: (event, button) =>
          members.find((m) => m.uuid === button.form.elements.summoner.value) ??
          null,
      },
    });
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static #onOpenParty(event, target) {
    const id = target.closest('[data-party-id]')?.dataset.partyId;
    game.actors.get(id)?.sheet.render(true);
  }

  static #onToggleSection(event, target) {
    const key = target.dataset.collapseKey;
    const folder = target.closest('li.folder');
    if (!key || !folder) return;
    folder.classList.toggle('expanded', this.#collapseState.toggle(key));
  }
}
