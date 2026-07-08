/**
 * Consumer-agnostic filtering state for the DASU sheets. Holds per-key search
 * text plus an optional row predicate (e.g. a Roster owner filter) behind a
 * single `isVisible(entry)` test, so the card layout and the
 * {@link DASUTableRenderer} table layout share one source of truth for "what
 * is currently shown."
 */
export class TableFilter {
  /** @type {Record<string, string>} */
  #search = {};

  /**
   * Optional extra predicates, keyed the same as search. Used for the Roster
   * owner filter.
   * @type {Record<string, (entry: object) => boolean>}
   */
  #predicates = {};

  /** @type {string} Entry field whose text is matched against the search string. */
  #searchField;

  /** @param {string} [searchField='name'] Entry field matched against search. */
  constructor(searchField = 'name') {
    this.#searchField = searchField;
  }

  getSearch(key) {
    return this.#search[key] ?? '';
  }

  setSearch(key, value) {
    this.#search[key] = value ?? '';
  }

  /** Replace (or clear, with a nullish value) the extra predicate for a key. */
  setPredicate(key, predicate) {
    if (predicate) this.#predicates[key] = predicate;
    else delete this.#predicates[key];
  }

  /** Clear both the search text and any extra predicate for a key. */
  clear(key) {
    this.#search[key] = '';
    delete this.#predicates[key];
  }

  /** Visibility test for a key: search-field match AND registered predicate. */
  isVisible(key) {
    const search = this.getSearch(key).trim().toLowerCase();
    const predicate = this.#predicates[key];
    return (entry) => {
      if (
        search &&
        !String(entry?.[this.#searchField] ?? '')
          .toLowerCase()
          .includes(search)
      )
        return false;
      return predicate ? predicate(entry) : true;
    };
  }

  /**
   * Wire a filter bar's search input: restore the retained value, then call
   * `onChange(key)` on every keystroke after recording the new text.
   * @param {HTMLElement} bar     Element carrying `data-filter-bar="<key>"`.
   * @param {(key: string) => void} onChange
   */
  bindSearchBar(bar, onChange) {
    const key = bar.dataset.filterBar;
    const input = bar.querySelector('[data-filter-search]');
    if (!input) return;
    input.value = this.getSearch(key);
    // Guard against double-binding the same element across partial re-renders.
    if (input.dataset.filterBound) return;
    input.dataset.filterBound = 'true';
    input.addEventListener('input', () => {
      this.setSearch(key, input.value);
      onChange(key);
    });
  }
}
