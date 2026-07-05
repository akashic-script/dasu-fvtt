import { SYSTEM } from '../helpers/config.mjs';

const { CombatTracker } = foundry.applications.sidebar.tabs;

/**
 * DASU combat tracker.
 *
 * Renders two modes off one Combat:
 * - Staging (round 0): the encounter prep tool, before combat or negotiation is
 *   initiated. The GM declares the encounter kind here and stages each summoner's
 *   field (toggling daemons in/out of their stock tree, with a live Will Strain
 *   meter). A summoner may be staged across scenes.
 * - Started: turn order, plus per-team action pips (major/minor/free) in combat.
 *
 * The tree is resolved live from the summoner's stock, so leveling and
 * transformation/fusion are reflected immediately.
 */
export class DASUCombatTracker extends CombatTracker {
  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    actions: {
      dasuToggleFielded: DASUCombatTracker.#onToggleFielded,
      dasuToggleChanneled: DASUCombatTracker.#onToggleChanneled,
      dasuToggleBench: DASUCombatTracker.#onToggleBench,
      dasuSetKind: DASUCombatTracker.#onSetKind,
    },
  };

  /** @inheritDoc */
  static PARTS = {
    header: { template: 'templates/sidebar/tabs/combat/header.hbs' },
    tracker: { template: `systems/${SYSTEM}/templates/combat/tracker.hbs` },
    footer: { template: 'templates/sidebar/tabs/combat/footer.hbs' },
  };

  /** @inheritDoc */
  _attachFrameListeners() {
    super._attachFrameListeners();
    // Double-clicking a fielded daemon opens its sheet.
    this.element.addEventListener(
      'dblclick',
      this.#onDaemonDblClick.bind(this),
      { capture: true }
    );

    // The fielding tree reads live from actors' stock, so a stock change on any
    // summoner in the encounter must refresh the tracker.
    if (!this.#stockHookId) {
      this.#stockHookId = Hooks.on('updateActor', (actor, changes) => {
        if (!foundry.utils.hasProperty(changes, 'system.stock')) return;
        const inEncounter = this.viewed?.combatants?.some(
          (c) => c.actor?.id === actor.id
        );
        if (inEncounter) this.render();
      });
    }
  }

  /** Registered `updateActor` hook id, so it is added only once. */
  #stockHookId;

  /** @param {MouseEvent} event */
  #onDaemonDblClick(event) {
    const row = event.target.closest('[data-daemon-uuid]');
    if (!row) return;
    event.stopPropagation();
    const daemon = fromUuidSync(row.dataset.daemonUuid);
    if (!daemon?.testUserPermission?.(game.user, 'OBSERVER')) return;
    daemon.sheet?.render(true);
  }

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    if (this.viewed?.round === 0) {
      const title = this.element.querySelector('.encounter-title');
      if (title) title.textContent = game.i18n.localize('DASU.Combat.StagingPhase');
    }
  }

  /** @inheritDoc */
  async _prepareTrackerContext(context, options) {
    await super._prepareTrackerContext(context, options);
    const combat = this.viewed;
    if (!combat) return;

    context.isStaging = combat.round === 0;
    context.encounterKind = combat.system?.kind ?? 'combat';
    // Kind is chosen during staging (GM only); locked once the encounter starts.
    context.canSetKind = context.isStaging && game.user.isGM;
    context.kinds = ['combat', 'negotiation'].map((k) => ({
      key: k,
      label: `DASU.Combat.Kind.${k === 'combat' ? 'Combat' : 'Negotiation'}`,
      active: context.encounterKind === k,
    }));

    // Enrich each turn context with DASU team/staging/action data.
    for (const turn of context.turns ?? []) {
      const combatant = combat.combatants.get(turn.id);
      if (!combatant) continue;
      turn.dasu = this.#prepareTeamContext(combatant);
    }
  }

  /**
   * Build the DASU-specific view model for a combatant row: its fielded daemon
   * tree, staging availability, strain meter, and action pips.
   * @param {Combatant} combatant
   * @returns {object}
   */
  #prepareTeamContext(combatant) {
    const isSummoner = combatant.isSummoner;
    const data = {
      role: combatant.system?.role ?? 'npc',
      isSummoner,
      actions: this.#prepareActions(combatant),
    };

    if (!isSummoner) return data;

    const actor = combatant.actor;
    const stock = actor?.system?.stock ?? [];

    // Fielding mirrors the actor's stock (active = fielded, inactive = benched).
    // A daemon whose system.summonerId doesn't point back here has drifted
    // (double-rostered / not migrated); surface it as a `stale` badge, don't hide.
    const isChanneler = !!actor.system?.isChanneler;
    const fielded = [];
    const bench = [];
    let strainUsed = 0;
    let staleCount = 0;
    for (const entry of stock) {
      const daemon = fromUuidSync(entry.uuid);
      if (daemon?.type !== 'daemon') continue;
      const strain = daemon.system?.strain?.value ?? 0;
      const stale = daemon.system?.summonerId !== actor.id;
      if (stale) staleCount++;
      const row = {
        uuid: entry.uuid,
        name: daemon.name,
        img: daemon.img,
        fielded: !!entry.active,
        channeled: !!entry.channeled,
        isChanneler,
        stale,
        strain,
        hp: this.#resourceLabel(daemon.system?.resources?.hp),
        wp: this.#resourceLabel(daemon.system?.resources?.wp),
      };
      if (row.fielded) {
        fielded.push(row);
        strainUsed += strain;
      } else {
        bench.push(row);
      }
    }

    const cap = actor?.system?.willStrain?.cap ?? 0;

    data.fielded = fielded;
    data.bench = bench;
    data.hasFielded = fielded.length > 0;
    data.benchCount = bench.length;
    data.collapsed = this.#isCollapsed(combatant.id);
    data.strain = { used: strainUsed, cap, over: strainUsed > cap };
    data.staleCount = staleCount;
    return data;
  }

  /**
   * Client-local bench collapse state, kept off the document so a view toggle
   * needs no DB write or owner permission. Defaults to collapsed.
   * @param {string} combatantId
   * @returns {boolean}
   */
  #isCollapsed(combatantId) {
    this.#expandedBench ??= new Set();
    return !this.#expandedBench.has(combatantId);
  }

  /** Combatant ids whose bench is currently expanded (client-local). */
  #expandedBench;

  /** Format a resource `{value, max}` as a "value/max" label, or null. */
  #resourceLabel(res) {
    if (!res) return null;
    const value = res.value ?? 0;
    const max = res.max ?? value;
    return `${value}/${max}`;
  }

  /** Action-pip view model (spent/remaining), for in-combat display. */
  #prepareActions(combatant) {
    const a = combatant.system?.actions;
    if (!a) return null;
    const pip = (slot, max) => {
      const spent = slot?.spent ?? 0;
      return { spent, max, remaining: Math.max(0, max - spent) };
    };
    return {
      major: pip(a.major, a.major?.max ?? 1),
      minor: pip(a.minor, a.minor?.max ?? 1),
      free: { spent: a.free?.spent ?? 0 },
    };
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /**
   * Field/bench a daemon by flipping its `active` flag on the summoner's stock,
   * the same source of truth the actor sheet edits, so the two stay in sync.
   */
  static async #onToggleFielded(event, target) {
    const combatantId = target.closest('[data-combatant-id]')?.dataset
      .combatantId;
    const daemonUuid = target.dataset.uuid;
    const combat = this.viewed;
    const actor = combat?.combatants.get(combatantId)?.actor;
    if (!actor || !daemonUuid) return;

    const stock = foundry.utils.deepClone(actor.system?.stock ?? []);
    const entry = stock.find((e) => e.uuid === daemonUuid);
    if (!entry) return;
    entry.active = !entry.active;
    // An inactive daemon cannot be channeled; drop it when leaving the field.
    if (!entry.active) entry.channeled = false;
    await actor.update({ 'system.stock': stock });
  }

  /**
   * Toggle a daemon's `channeled` flag. Only one may be channeled at a time;
   * channeling a new daemon automatically un-channels the previous one.
   */
  static async #onToggleChanneled(event, target) {
    event.stopPropagation();
    target.blur();
    const combatantId = target.closest('[data-combatant-id]')?.dataset.combatantId;
    const daemonUuid = target.dataset.uuid;
    const combat = this.viewed;
    const actor = combat?.combatants.get(combatantId)?.actor;
    if (!actor || !daemonUuid) return;

    const stock = foundry.utils.deepClone(actor.system?.stock ?? []);
    const entry = stock.find((e) => e.uuid === daemonUuid);
    if (!entry) return;
    const next = !entry.channeled;
    // Un-channel all, then set the target (exclusive channel).
    for (const e of stock) e.channeled = false;
    entry.channeled = next;
    await actor.update({ 'system.stock': stock });
  }

  /** Set the encounter kind (combat/negotiation) during staging. GM only. */
  static async #onSetKind(event, target) {
    const combat = this.viewed;
    if (!combat || !game.user.isGM) return;
    const kind = target.dataset.kind;
    if (!kind || combat.system?.kind === kind) return;
    await combat.update({ 'system.kind': kind });
  }

  /** Expand/collapse a summoner's bench (unfielded stock). Client-local view. */
  static async #onToggleBench(event, target) {
    const combatantId = target.closest('[data-combatant-id]')?.dataset
      .combatantId;
    if (!combatantId) return;
    this.#expandedBench ??= new Set();
    if (this.#expandedBench.has(combatantId)) {
      this.#expandedBench.delete(combatantId);
    } else {
      this.#expandedBench.add(combatantId);
    }
    this.render();
  }
}
