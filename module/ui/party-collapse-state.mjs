import { SYSTEM } from '../helpers/config.mjs';

/**
 * Tracks which party/section pseudo-folders are collapsed in the Actors
 * sidebar, persisted client-side. Keys are `partyId` (the party row itself)
 * or `partyId:section` (Summoners/Roster/Storage).
 */
export class PartyCollapseState {
  #settingKey;
  #collapsed;

  constructor(settingKey) {
    this.#settingKey = settingKey;
    this.#collapsed = new Set(game.settings.get(SYSTEM, settingKey) ?? []);
  }

  isCollapsed(key) {
    return this.#collapsed.has(key);
  }

  #persist() {
    game.settings.set(SYSTEM, this.#settingKey, [...this.#collapsed]);
  }

  /** Toggle a key's collapsed state and persist it. Returns whether it is now expanded. */
  toggle(key) {
    const expanded = this.#collapsed.has(key);
    if (expanded) this.#collapsed.delete(key);
    else this.#collapsed.add(key);
    this.#persist();
    return !expanded;
  }

  /**
   * Reconcile state with whatever is actually expanded/collapsed in the live
   * DOM right now, so a rebuild triggered by an unrelated data change (e.g. a
   * drop) never reverts a toggle the user made since the last render.
   * @param {HTMLElement} root  The rendered parties container to read from.
   */
  syncFromDOM(root) {
    for (const header of root.querySelectorAll('[data-collapse-key]')) {
      const key = header.dataset.collapseKey;
      const folder = header.closest('li.folder');
      if (!key || !folder) continue;
      if (folder.classList.contains('expanded')) this.#collapsed.delete(key);
      else this.#collapsed.add(key);
    }
  }
}
