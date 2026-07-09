import { Checks } from '../checks/checks.mjs';

/**
 * DASU Combat (encounter) document. Initiative rolls route through the DASU
 * check pipeline (2d10 + DEX or a skill); summoner combatants are tagged so the
 * tracker renders their fielding tree.
 */
export class DASUCombat extends Combat {
  /** Round 0: pre-start staging phase (fielding tree, not turn order). */
  get isStaging() {
    return this.round === 0;
  }

  /**
   * Roll initiative via the DASU check pipeline (2d10 + DEX, or `options.skill`).
   * @override
   * @param {string|string[]} ids
   * @param {object} [options]
   * @param {string|null} [options.skill] skill key to use instead of DEX
   * @param {boolean} [options.updateTurn=true]
   * @param {(check) => void} [options.configure] extra check config, applied last
   */
  async rollInitiative(
    ids,
    { skill = null, updateTurn = true, configure = null } = {}
  ) {
    ids = typeof ids === 'string' ? [ids] : ids;
    const updates = [];

    for (const id of ids) {
      const combatant = this.combatants.get(id);
      if (!combatant?.isOwner) continue;
      const actor = combatant.actor;
      if (!actor) continue;

      const result = await Checks.initiativeCheck(actor, (check) => {
        if (skill) check.skill = skill;
        check.additionalData.combatId = this.id;
        check.additionalData.combatantId = combatant.id;
        configure?.(check);
      });

      const total = result?.result;
      if (Number.isFinite(total)) {
        updates.push({ _id: id, initiative: total });
      }
    }

    if (updates.length)
      await this.updateEmbeddedDocuments('Combatant', updates);

    if (updateTurn && this.combatant?.id && ids.includes(this.combatant.id)) {
      await this.update({
        turn: this.turns.findIndex((t) => t.id === this.combatant.id),
      });
    }

    return this;
  }

  /**
   * Start the encounter: lock the staged roster and (per setting) auto-roll
   * initiative for anyone who hasn't rolled.
   * @override
   */
  async startCombat() {
    const stageUpdates = this.combatants
      .filter((c) => c.isOwner && !c.system?.staged)
      .map((c) => ({ _id: c.id, 'system.staged': true }));
    if (stageUpdates.length) {
      await this.updateEmbeddedDocuments('Combatant', stageUpdates);
    }

    const result = await super.startCombat();

    if (game.settings.get('dasu', 'autoRollInitiative')) {
      const unrolled = this.combatants
        .filter((c) => c.isOwner && !Number.isFinite(c.initiative))
        .map((c) => c.id);
      if (unrolled.length) await this.rollInitiative(unrolled);
    }

    return result;
  }

  /**
   * Tag a new summoner combatant with the `summoner` role so the tracker renders
   * its fielding tree (fielding is read live from stock, nothing is seeded).
   * Runs on the creating client.
   */
  async _seedFielded(combatant, options, userId) {
    if (game.userId !== userId) return;
    if (!combatant.isSummoner) return;
    if (combatant.system?.role !== 'summoner') {
      await combatant.update({ 'system.role': 'summoner' });
    }
  }

  /** @override reset action economy and skip incapacitated combatants. */
  async _onStartTurn(combatant) {
    await super._onStartTurn?.(combatant);
    await this.#skipIfIncapacitated(combatant);
    await this.#resetActions(combatant);
  }

  /** Reset spent major/minor/free actions at the start of a turn. */
  async #resetActions(combatant) {
    if (!combatant?.isOwner) return;
    await combatant.update({
      'system.actions.major.spent': 0,
      'system.actions.minor.spent': 0,
      'system.actions.free.spent': 0,
    });
  }

  /** Mark an incapacitated combatant (HP or WP at 0) defeated so it's skipped. */
  async #skipIfIncapacitated(combatant) {
    if (!combatant?.isOwner) return;
    if (combatant.isIncapacitated && !combatant.isDefeated) {
      await combatant.update({ defeated: true });
    }
  }
}

/** Register combat-lifecycle hooks that live outside the document class. */
export function initializeCombat() {
  // Party actors are a roster container, not a combat participant
  Hooks.on('preCreateCombatant', (combatant) => {
    if (combatant.actor?.type === 'party') return false;
  });

  Hooks.on('createCombatant', (combatant, options, userId) => {
    const combat = combatant.parent;
    if (!(combat instanceof DASUCombat)) return;
    Promise.resolve(combat._seedFielded(combatant, options, userId)).catch(
      (err) =>
        Hooks.onError('createCombatant#seedFielded', err, {
          log: 'error',
          notify: 'error',
        })
    );
  });
}
