/**
 * Indexes system/world/module packs for the {@link CompendiumBrowser}.
 * Items/Tags and ActiveEffects use each pack's lightweight `index` (see
 * {@link INDEX_FIELDS}/{@link EFFECT_INDEX_FIELDS}); Actors load as full
 * documents since the daemon tab filters on embedded items the index can't carry.
 * New fields a renderer/filter reads must be added to the relevant field list.
 */

/**
 * `system.*` paths the renderers/filters read. Unlisted paths come back undefined.
 * @type {string[]}
 */
const INDEX_FIELDS = [
  // Daemon columns / filters / description.
  'system.level',
  'system.roles',
  'system.biography',
  // Shared item description.
  'system.description',
  // Item-tab per-type summary formatters.
  'system.bonuses',
  'system.statAllocationBonus',
  'system.maxAbilitySlots',
  'system.maxTacticSlots',
  'system.effects',
  'system.damage',
  'system.toHit',
  'system.category',
  'system.heal',
  'system.isInfinity',
  'system.govern',
  'system.sp',
  'system.kind',
  'system.skillLabel',
  // Tag columns / filters.
  'system.pricePerRank',
  'system.applicableTypes',
];

/**
 * Top-level ActiveEffect fields the effects tab reads (effects keep their data at
 * the document root, not under `system`).
 * @type {string[]}
 */
const EFFECT_INDEX_FIELDS = [
  'description',
  'changes',
  'duration',
  'statuses',
  'transfer',
  'disabled',
  'flags.dasu.stacks',
  'flags.dasu.maxStacks',
];

/**
 * @typedef CompendiumSourceInfo
 * @property {string} id     Package id (pack collection, e.g. "dasu.daemons").
 * @property {string} label  Human-readable pack label.
 * @property {'system'|'module'|'world'} type
 */

export class CompendiumIndex {
  /** @type {CompendiumIndex} */
  static #instance;

  /** @returns {CompendiumIndex} */
  static get instance() {
    return (CompendiumIndex.#instance ??= new CompendiumIndex());
  }

  /** Drop the cache so the next access rebuilds from packs. */
  static reinitialize() {
    CompendiumIndex.#instance = undefined;
  }

  /** @type {Record<string, object[]>} Item index entries by subtype. */
  #itemsByType;

  /** @type {Record<string, foundry.abstract.Document[]>} Full Actor docs by subtype. */
  #actorsByType;

  /** @type {object[]} ActiveEffect index entries, flat. */
  #effects;

  /** Readable packs of a document type (system plus world/module). */
  getPacks(documentName) {
    return game.packs.filter(
      (p) =>
        p.documentName === documentName &&
        p.testUserPermission(game.user, 'OBSERVER')
    );
  }

  /** Load each pack's index, grouped by subtype, tagged with source pack (`_pack`/`_packLabel`). */
  async #loadIndexByType(documentName, fields = INDEX_FIELDS) {
    const result = {};
    const packs = this.getPacks(documentName);
    const loaded = await Promise.all(
      packs.map((pack) =>
        pack.getIndex({ fields }).then((index) => ({ pack, index }))
      )
    );
    for (const { pack, index } of loaded) {
      for (const entry of index) {
        entry._pack = pack.collection;
        entry._packLabel = pack.metadata.label;
        (result[entry.type] ??= []).push(entry);
      }
    }
    return result;
  }

  /** Load full documents, grouped by subtype, tagged with source pack. */
  async #loadDocumentsByType(documentName) {
    const result = {};
    const packs = this.getPacks(documentName);
    const loaded = await Promise.all(
      packs.map((pack) => pack.getDocuments().then((docs) => ({ pack, docs })))
    );
    for (const { pack, docs } of loaded) {
      for (const doc of docs) {
        // Non-enumerable so the tags never leak into document diffs/updates.
        Object.defineProperty(doc, '_pack', {
          value: pack.collection,
          configurable: true,
        });
        Object.defineProperty(doc, '_packLabel', {
          value: pack.metadata.label,
          configurable: true,
        });
        (result[doc.type] ??= []).push(doc);
      }
    }
    return result;
  }

  async getItems(force = false) {
    if (!this.#itemsByType || force) {
      this.#itemsByType = await this.#loadIndexByType('Item');
    }
    return this.#itemsByType;
  }

  /** Actors as full documents (see class header), grouped by subtype. */
  async getActors(force = false) {
    if (!this.#actorsByType || force) {
      this.#actorsByType = await this.#loadDocumentsByType('Actor');
    }
    return this.#actorsByType;
  }

  async getItemsOfType(type) {
    const groups = await this.getItems();
    return groups[type] ?? [];
  }

  async getActorsOfType(type) {
    const groups = await this.getActors();
    return groups[type] ?? [];
  }

  /** ActiveEffect index entries across every effect pack, flattened. */
  async getEffects(force = false) {
    if (!this.#effects || force) {
      const byType = await this.#loadIndexByType(
        'ActiveEffect',
        EFFECT_INDEX_FIELDS
      );
      this.#effects = Object.values(byType).flat();
    }
    return this.#effects;
  }

  /** Source (pack) options for entries currently in hand, as checkbox options. */
  getSourceInfo(entries) {
    const sources = new Map();
    for (const entry of entries) {
      if (!entry._pack || sources.has(entry._pack)) continue;
      sources.set(entry._pack, { id: entry._pack, label: entry._packLabel });
    }
    return [...sources.values()].sort((a, b) =>
      a.label.localeCompare(b.label, game.i18n.lang)
    );
  }

  /** Rebuild the index whenever a compendium's contents change. */
  static initialize() {
    Hooks.on('updateCompendium', () => CompendiumIndex.reinitialize());
  }
}
