import { Pipeline } from './pipeline.mjs';
import { SYSTEM } from '../config.mjs';

/**
 * Heal or spend a resource (hp/wp). One pipeline, two ops: heal adds, cost
 * subtracts. Percent values resolve against the resource max. Replaces the old
 * one-shot deduct-cost button with an undoable apply.
 */
export class ResourcePipeline extends Pipeline {
  static type = 'resource';

  computeOutcome(input, target) {
    const resource = input.resource === 'wp' ? 'wp' : 'hp';
    const pool = target.system?.resources?.[resource] ?? {};
    const max = pool.max ?? 0;
    const priorValue = pool.value ?? 0;

    const rawBase =
      input.mode === 'percent'
        ? Math.floor((max * (input.value ?? 0)) / 100)
        : input.value ?? 0;

    // Situational recovery/loss tuning on the receiving actor.
    const bonuses = target.system?.bonuses;
    const tune =
      input.op === 'cost'
        ? bonuses?.incomingLoss?.[resource] ?? 0
        : bonuses?.incomingRecovery?.[resource] ?? 0;
    const base = Math.max(0, rawBase + tune);

    const delta = input.op === 'cost' ? -base : base;
    const newValue = Math.max(0, Math.min(max, priorValue + delta));

    return { resource, op: input.op, amount: base, delta, priorValue, newValue, max };
  }

  async applyToTarget(outcome, target) {
    await target.update({
      [`system.resources.${outcome.resource}.value`]: outcome.newValue,
    });
    return { resource: outcome.resource, priorValue: outcome.priorValue };
  }

  async revert(revertData, target) {
    await target.update({
      [`system.resources.${revertData.resource}.value`]: revertData.priorValue,
    });
  }

  get resultTemplate() {
    return `systems/${SYSTEM}/templates/chat/pipeline/body-resource.hbs`;
  }

  getMessageData(state) {
    const c = state.computed;
    return {
      op: c.op,
      isCost: c.op === 'cost',
      resource: c.resource,
      resourceLabel: game.i18n.localize(
        c.resource === 'wp' ? 'DASU.Resource.WP' : 'DASU.Resource.HP'
      ),
      amount: c.amount,
      priorValue: c.priorValue,
      newValue: c.newValue,
    };
  }
}
