import { importDaemonToWorld } from '../helpers/daemon-stock.mjs';

/**
 * Advisory ability/tactic slot capacity by daemon subtype. The created
 * daemon's real cap comes from its subtype item.
 * @type {Record<string, number>}
 */
const FUSION_SUBTYPE_SLOTS = { child: 4, self: 6, god: 8 };

export default class DASUParty extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { HTMLField, SetField, DocumentUUIDField } = foundry.data.fields;
    return {
      description: new HTMLField(),
      notes: new HTMLField(),
      members: new SetField(
        new DocumentUUIDField({ type: 'Actor', nullable: true })
      ),
      storage: new SetField(
        new DocumentUUIDField({ type: 'Actor', nullable: true })
      ),
    };
  }

  /**
   * Resolve a uuid Set field to live Actor documents of the expected type,
   * pruning any that no longer resolve (deleted). Writes back the prune.
   */
  async #resolveAndPrune(field, expectedType) {
    const resolved = [];
    const stale = [];
    for (const uuid of this[field]) {
      const actor = await fromUuid(uuid);
      if (actor?.type === expectedType) resolved.push(actor);
      else stale.push(uuid);
    }
    if (stale.length && this.parent?.isOwner) {
      const next = new Set(this[field]);
      for (const uuid of stale) next.delete(uuid);
      await this.parent.update({ [`system.${field}`]: [...next] });
    }
    return resolved;
  }

  async #addToSet(field, uuid) {
    const next = new Set(this[field]);
    next.add(uuid);
    await this.parent.update({ [`system.${field}`]: [...next] });
  }

  async #removeFromSet(field, uuid) {
    const next = new Set(this[field]);
    next.delete(uuid);
    await this.parent.update({ [`system.${field}`]: [...next] });
  }

  /** Resolve `members` to their live summoner Actors, pruning deleted ones. */
  async getMembers() {
    return this.#resolveAndPrune('members', 'summoner');
  }

  /** Add a summoner to the party. Only summoners may be members. */
  async addMember(actor) {
    if (actor?.type !== 'summoner') {
      ui.notifications?.warn(
        game.i18n.localize('DASU.Party.MemberSummonerOnly')
      );
      return false;
    }
    await this.#addToSet('members', actor.uuid);
    return true;
  }

  async removeMember(uuid) {
    return this.#removeFromSet('members', uuid);
  }

  async getMemberCardData() {
    const members = await this.getMembers();
    return members.map((actor) => ({
      actor,
      uuid: actor.uuid,
      name: actor.name,
      img: actor.img,
      level: actor.system.level,
      className: actor.itemTypes?.class?.[0]?.name ?? '',
      ...this.constructor.#hpWpBars(actor),
      willStrain: this.constructor.#willStrain(actor),
    }));
  }

  /**
   * Derived roster: the union of every member's stock daemons.
   * @returns {Promise<{daemon: Actor, owner: Actor, active: boolean, channeled: boolean}[]>}
   */
  async getRoster() {
    const members = await this.getMembers();
    const rows = [];
    for (const owner of members) {
      for (const entry of owner.system.stock ?? []) {
        const daemon = await fromUuid(entry.uuid);
        if (daemon?.type !== 'daemon') continue;
        rows.push({
          daemon,
          owner,
          active: !!entry.active,
          channeled: !!entry.channeled,
        });
      }
    }
    return rows;
  }

  async getRosterCardData() {
    const roster = await this.getRoster();
    return roster.map(({ daemon, owner, active, channeled }) => ({
      actor: daemon,
      uuid: daemon.uuid,
      name: daemon.name,
      img: daemon.img,
      ...this.constructor.#hpWpBars(daemon),
      roles: daemon.system.roles ?? [],
      strain: daemon.system.strain?.value ?? 0,
      ownerUuid: owner.uuid,
      ownerName: owner.name,
      active,
      channeled,
      // The channel toggle is a Channeler-class ability of the owning summoner.
      isChanneler: !!owner.system.isChanneler,
    }));
  }

  // TODO: optional per-summoner stock cap + shared party storage.
  async getStorage() {
    return this.#resolveAndPrune('storage', 'daemon');
  }

  async getStorageCardData() {
    const daemons = await this.getStorage();
    return daemons.map((daemon) => ({
      actor: daemon,
      uuid: daemon.uuid,
      name: daemon.name,
      img: daemon.img,
      ...this.constructor.#hpWpBars(daemon),
      roles: daemon.system.roles ?? [],
    }));
  }

  async addToStorage(uuid) {
    return this.#addToSet('storage', uuid);
  }

  async removeFromStorage(uuid) {
    return this.#removeFromSet('storage', uuid);
  }

  /**
   * Daemons available to fuse: the Roster plus party storage, deduped by uuid.
   * Each entry carries abilities/tactics/resistances for the workbench.
   * @returns {Promise<Array>}
   */
  async getFusionPool() {
    const roster = await this.getRoster();
    const storage = await this.getStorage();
    const daemons = [...roster.map((r) => r.daemon), ...storage];
    const seen = new Set();
    const pool = [];
    for (const daemon of daemons) {
      if (!daemon || seen.has(daemon.uuid)) continue;
      seen.add(daemon.uuid);
      pool.push(this.constructor.#fusionEntry(daemon));
    }
    return pool;
  }

  /** Shape a daemon into a fusion-pool entry (parents + ability picks). */
  static #fusionEntry(daemon) {
    const subtypeName =
      daemon.itemTypes?.subtype?.[0]?.name?.toLowerCase() ?? 'self';
    const abilities = (daemon.itemTypes?.ability ?? []).map((i) => ({
      uuid: i.uuid,
      id: i.id,
      name: i.name,
      img: i.img,
      kind: 'ability',
      category: i.system?.category ?? '',
      aptitude: i.system?.aptitude?.value ?? 1,
    }));
    const tactics = (daemon.itemTypes?.tactic ?? []).map((i) => ({
      uuid: i.uuid,
      id: i.id,
      name: i.name,
      img: i.img,
      kind: 'tactic',
    }));
    const specialAbilities = (daemon.itemTypes?.specialAbility ?? []).map(
      (i) => ({
        uuid: i.uuid,
        id: i.id,
        name: i.name,
        img: i.img,
        kind: 'specialAbility',
      })
    );
    const resistances = Object.entries(daemon.system?.resistances ?? {})
      .filter(([, r]) => (r?.base ?? 0) > 0)
      .map(([type, r]) => ({ type, level: r.base, kind: 'resistance' }));
    return {
      uuid: daemon.uuid,
      name: daemon.name,
      img: daemon.img,
      level: daemon.system?.level ?? 1,
      roles: daemon.system?.roles ?? [],
      subtype: subtypeName,
      abilities,
      tactics,
      specialAbilities,
      resistances,
    };
  }

  /** Keepsake slot cap (Child 4 / Self 6 / God 8) for a subtype key. */
  static fusionSlotsFor(subtype) {
    return FUSION_SUBTYPE_SLOTS[String(subtype).toLowerCase()] ?? 6;
  }

  /** Auto subtype for a fusion: the higher-ranked (higher slot cap) of the two parents'. */
  static fusionAutoSubtype(subtypeA, subtypeB) {
    return this.fusionSlotsFor(subtypeB) > this.fusionSlotsFor(subtypeA)
      ? subtypeB
      : subtypeA;
  }

  /**
   * Create a fused daemon from the higher parent as a base, apply the chosen
   * options, and drop it into party storage. Parents are left untouched.
   * Returns the new Actor, or null.
   *
   * @param {object} opts
   * @param {string}   opts.baseUuid    Statblock base (the higher-level parent).
   * @param {string}   opts.role        Role key (CONFIG.DASU.daemonRoles).
   * @param {string}   opts.subtype     Subtype key ('child'|'self'|'god').
   * @param {number}   opts.level       Result level.
   * @param {Array}    [opts.keepsakes] Item/blend picks to carry over.
   * @param {string}   [opts.name]      Result name.
   * @param {object}   [opts.bonus]     Great Fusion bonus payload.
   * @param {object}   [opts.accident]  Fusion Accident payload.
   * @param {{fromUuid: string, id: string}} [opts.specialAbility] Which parent's
   *   Special Ability carries over (default: base parent's).
   * @returns {Promise<Actor|null>}
   */
  async createFusedDaemon({
    baseUuid,
    role,
    subtype = 'self',
    level,
    keepsakes = [],
    name,
    bonus = null,
    accident = null,
    specialAbility = null,
  }) {
    const base = await fromUuid(baseUuid);
    if (base?.type !== 'daemon') return null;

    const data = base.toObject();
    delete data._id;
    delete data.folder;
    data.name = name?.trim() || `${base.name} (Fused)`;
    if (Number.isFinite(level)) data.system.level = level;
    data.system.summonerId = null;
    data.system.roles = role ? [role] : [];

    // The base parent's Special Ability is already in `data.items`; an
    // explicit pick from the other parent swaps it in instead.
    if (specialAbility?.fromUuid && specialAbility.fromUuid !== baseUuid) {
      const other = await fromUuid(specialAbility.fromUuid);
      const item = other?.items.get(specialAbility.id);
      if (item) {
        data.items = (data.items ?? []).filter(
          (i) => i.type !== 'specialAbility'
        );
        const itemData = item.toObject();
        delete itemData._id;
        data.items.push(itemData);
      }
    }

    // Carry each kept ability/tactic as an embedded item.
    const keepsakeItems = [];
    for (const pick of keepsakes) {
      // A blend pick merges two abilities into one.
      if (pick?.kind === 'blend') {
        const base = await fromUuid(pick.baseUuid);
        const secondary = await fromUuid(pick.secondaryUuid);
        if (base?.type !== 'ability' || secondary?.type !== 'ability') continue;
        const blended = this.constructor.#blendAbilityData(
          base.toObject(),
          secondary.toObject(),
          pick.dropTagIds ?? [],
          pick.addTagIds ?? [],
          pick.name
        );
        keepsakeItems.push(blended);
        continue;
      }
      const parent = await fromUuid(pick?.fromUuid);
      if (!parent) continue;
      const item = parent.items.get(pick.id);
      if (!item) continue;
      const itemData = item.toObject();
      delete itemData._id;
      keepsakeItems.push(itemData);
    }

    // Great Fusion (10-10): apply the one chosen bonus (stat or resistance).
    const notes = [];
    if (bonus) {
      if (
        bonus.kind === 'stat' &&
        (bonus.stat === 'avoid' || bonus.stat === 'defense')
      ) {
        const path = `system.stats.${bonus.stat}.bonus`;
        const current = foundry.utils.getProperty(data, path) ?? 0;
        foundry.utils.setProperty(data, path, current + 1);
      } else if (bonus.kind === 'resist' && bonus.type) {
        const path = `system.resistances.${bonus.type}.base`;
        const current = foundry.utils.getProperty(data, path) ?? 0;
        foundry.utils.setProperty(data, path, Math.min(3, current + 1));
      }
      notes.push(game.i18n.localize('DASU.Party.Fusion.GreatNote'));
    }

    // Fusion Accident (1-1): note the direction in the description. Wrong
    // Shape's Role swap already happened at roll time.
    if (accident) {
      const dirKey = `Acc_${accident.kind}`;
      notes.push(
        `${game.i18n.localize('DASU.Party.Fusion.AccidentNote')} · ` +
          `${game.i18n.localize(`DASU.Party.Fusion.${dirKey}`)}: ` +
          game.i18n.localize(`DASU.Party.Fusion.${dirKey}_desc`)
      );
    }

    if (notes.length) {
      const banner = notes.map((n) => `<p><em>${n}</em></p>`).join('');
      data.system.biography = `${banner}${data.system.biography ?? ''}`;
    }

    // Base already carries its own items; append Keepsakes from the other
    // parent (deduped by name to avoid obvious doubles).
    const have = new Set((data.items ?? []).map((i) => i.name));
    data.items = [
      ...(data.items ?? []),
      ...keepsakeItems.filter((i) => !have.has(i.name)),
    ];

    const created = await importDaemonToWorld({
      name: data.name,
      toObject: () => data,
    });
    if (!created) return null;

    await this.addToStorage(created.uuid);
    return created;
  }

  /**
   * Create a fused ability by cloning the base ability and swapping in tags
   * from the secondary ability, within the override-slot limit. The base's
   * chassis (category/aptitude/damage/cost/toHit/scope) is preserved; only
   * tags change. The new ability is created on the base ability's owning actor.
   *
   * @param {object} opts
   * @param {string}   opts.baseUuid       The base ability item uuid.
   * @param {string}   opts.secondaryUuid  The secondary ability item uuid.
   * @param {string[]} [opts.dropTagIds]   Base tag ids to remove.
   * @param {string[]} [opts.addTagIds]    Secondary tag ids to add.
   * @param {string}   [opts.name]         Result name.
   * @returns {Promise<Item|null>}
   */
  async createFusedAbility({
    baseUuid,
    secondaryUuid,
    dropTagIds = [],
    addTagIds = [],
    name,
  }) {
    const base = await fromUuid(baseUuid);
    const secondary = await fromUuid(secondaryUuid);
    if (base?.type !== 'ability' || secondary?.type !== 'ability') return null;

    const data = this.constructor.#blendAbilityData(
      base.toObject(),
      secondary.toObject(),
      dropTagIds,
      addTagIds,
      name
    );

    const owner = base.parent;
    if (!owner) return null;
    const [created] = await owner.createEmbeddedDocuments('Item', [data]);
    return created ?? null;
  }

  /**
   * Apply the Ability Fusion tag swap to a base ability's serialised object:
   * keep the base's chassis, drop the named base tags, add the named secondary
   * tags (with fresh ids). Returns new item data (no `_id`) ready to embed.
   * @param {object} baseObj       The base ability's toObject().
   * @param {object} secondaryObj  The secondary ability's toObject().
   * @param {string[]} dropTagIds  Base tag ids to remove.
   * @param {string[]} addTagIds   Secondary tag ids to add.
   * @param {string} [name]        Result name.
   * @returns {object}
   */
  static #blendAbilityData(baseObj, secondaryObj, dropTagIds, addTagIds, name) {
    const data = foundry.utils.deepClone(baseObj);
    delete data._id;
    data.name = name?.trim() || `${baseObj.name} (Fused)`;

    const drop = new Set(dropTagIds ?? []);
    const kept = (data.system.tags ?? []).filter((t) => !drop.has(t._id));
    const secTags = (secondaryObj.system.tags ?? []).filter((t) =>
      (addTagIds ?? []).includes(t._id)
    );
    // Give incoming tags fresh ids so they don't collide with the base's.
    for (const t of secTags) t._id = foundry.utils.randomID();
    data.system.tags = [...kept, ...secTags];
    return data;
  }

  static #hpWpBars(actor) {
    const hp = actor.system.resources?.hp ?? {};
    const wp = actor.system.resources?.wp ?? {};
    return {
      hp,
      wp,
      hpPct: this.#pct(hp),
      wpPct: this.#pct(wp),
    };
  }

  static #pct(res) {
    if (!res?.max) return 0;
    return Math.min(100, Math.max(0, (res.value / res.max) * 100));
  }

  /** Current Will Strain = sum of fielded daemons' WSC, vs the summoner's cap. */
  static #willStrain(actor) {
    const cap = actor.system.willStrain?.cap ?? 0;
    const used = (actor.system.stock ?? [])
      .filter((e) => e.active)
      .reduce(
        (sum, e) => sum + (fromUuidSync(e.uuid)?.system?.strain?.value ?? 0),
        0
      );
    return { used, cap, over: used > cap };
  }

  /** @override */
  static async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    this.parent.updateSource({
      'prototypeToken.actorLink': true,
      'prototypeToken.disposition': CONST.TOKEN_DISPOSITIONS.FRIENDLY,
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
    });
  }
}
