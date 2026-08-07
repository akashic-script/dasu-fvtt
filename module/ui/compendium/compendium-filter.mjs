/**
 * Filtering state for the {@link CompendiumBrowser}: free-text search plus
 * categories (checkbox groups) and ranges (min/max), collapsed into the
 * `isVisible(entry)` predicate handed to {@link DASUTableRenderer.renderTable}.
 * `matchTypes` scopes a category to certain entry `type`s, e.g. an ability-only
 * Subtype filter won't hide weapons in the merged Items tab.
 *
 * @typedef CompendiumFilterCategory
 * @property {string} label                i18n key for the group heading.
 * @property {string} propertyPath         Dot path read from each entry.
 * @property {{value: string, label: string}[]} options
 * @property {Set<string>} [selected]       Selected option values.
 * @property {Set<string>} [matchTypes]     Entry `type`s this category applies to.
 * @property {string} [parentType]          Subtype: auto-selects `type` when checked.
 *
 * @typedef CompendiumFilterRange
 * @property {string} label                i18n key for the group heading.
 * @property {string} propertyPath         Dot path read from each entry.
 * @property {number} [defaultMin]          Initial/reset value of min.
 * @property {number} [defaultMax]          Initial/reset value of max.
 * @property {number} [min]                Current lower bound.
 * @property {number} [max]                Current upper bound.
 */

export class CompendiumFilter {
  /** @type {string} */
  #text = '';

  /** @type {Record<string, CompendiumFilterCategory>} */
  #categories = {};

  /** @type {Record<string, CompendiumFilterRange>} */
  #ranges = {};

  constructor() {
    // Stable reference so renderTable's isVisible option can be passed directly.
    this.isVisible = this.isVisible.bind(this);
  }

  get text() {
    return this.#text;
  }

  setText(text) {
    this.#text = text ?? '';
  }

  /** @returns {Record<string, CompendiumFilterCategory>} */
  get categories() {
    return this.#categories;
  }

  /** @returns {Record<string, CompendiumFilterRange>} */
  get ranges() {
    return this.#ranges;
  }

  /**
   * Replace categories, keeping still-valid prior selections across re-renders.
   * @param {Record<string, CompendiumFilterCategory>} categories
   */
  setCategories(categories) {
    const previous = this.#categories;
    for (const [id, category] of Object.entries(categories)) {
      const prior = previous[id]?.selected;
      const valid = new Set(category.options.map((o) => o.value));
      category.selected = new Set(
        [...(prior ?? [])].filter((value) => valid.has(value))
      );
    }
    this.#categories = categories;
  }

  /**
   * Replace ranges, keeping prior bounds; unseen ranges start at their defaults.
   * @param {Record<string, CompendiumFilterRange>} ranges
   */
  setRanges(ranges) {
    const previous = this.#ranges;
    for (const [id, range] of Object.entries(ranges)) {
      const prior = previous[id];
      range.min = prior ? prior.min : range.defaultMin;
      range.max = prior ? prior.max : range.defaultMax;
    }
    this.#ranges = ranges;
  }

  toggle(id, option, checked) {
    const category = this.#categories[id];
    if (!category) return;
    category.selected ??= new Set();
    if (checked) category.selected.add(option);
    else category.selected.delete(option);
  }

  setRangeBound(id, bound, value) {
    const range = this.#ranges[id];
    if (!range) return;
    range[bound] = value ?? undefined;
  }

  /** Reset search, category selections, and range bounds to their defaults. */
  clear() {
    this.#text = '';
    for (const category of Object.values(this.#categories)) {
      category.selected = new Set();
    }
    for (const range of Object.values(this.#ranges)) {
      range.min = range.defaultMin;
      range.max = range.defaultMax;
    }
  }

  /** True if the category has a selection, so callers can skip a faceting pass. */
  hasSelection(id) {
    return (this.#categories[id]?.selected?.size ?? 0) > 0;
  }

  isVisible(entry) {
    return this.isVisibleExcluding(entry, null);
  }

  /** Like {@link isVisible} but ignores one category's selection, to facet its options. */
  isVisibleExcluding(entry, excludeCategoryId) {
    const text = this.#text.trim().toLowerCase();
    if (text && !entry.name?.toLowerCase().includes(text)) return false;

    for (const [id, category] of Object.entries(this.#categories)) {
      if (id === excludeCategoryId) continue;
      const selected = category.selected;
      if (!selected?.size) continue;
      if (category.matchTypes && !category.matchTypes.has(entry.type)) continue;

      const raw = foundry.utils.getProperty(entry, category.propertyPath);
      const values = Array.isArray(raw) ? raw : [raw];
      if (!values.some((value) => selected.has(value))) return false;
    }

    for (const range of Object.values(this.#ranges)) {
      if (range.min == null && range.max == null) continue;
      const value = foundry.utils.getProperty(entry, range.propertyPath);
      if (range.min != null && value < range.min) return false;
      if (range.max != null && value > range.max) return false;
    }
    return true;
  }
}
