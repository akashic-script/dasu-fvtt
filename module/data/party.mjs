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
