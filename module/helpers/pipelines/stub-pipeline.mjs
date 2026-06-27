import { Pipeline } from './pipeline.mjs';

/**
 * Minimal pipeline used to validate the framework end to end: subtracts a flat
 * amount from the target's HP and supports undo/redo. Not registered in
 * production; remove once the concrete pipelines exist.
 */
export class StubPipeline extends Pipeline {
  static type = 'stub';

  computeOutcome(input, target) {
    const current = target.system?.resources?.hp?.value ?? 0;
    const amount = input.amount ?? 0;
    return { amount, priorValue: current, newValue: Math.max(0, current - amount) };
  }

  async applyToTarget(outcome, target) {
    await target.update({ 'system.resources.hp.value': outcome.newValue });
    return { resource: 'hp', priorValue: outcome.priorValue };
  }

  async revert(revertData, target) {
    await target.update({
      'system.resources.hp.value': revertData.priorValue,
    });
  }

  get resultTemplate() {
    return 'systems/dasu/templates/chat/pipeline/body-stub.hbs';
  }

  getMessageData(state) {
    return {
      amount: state.computed.amount,
      priorValue: state.computed.priorValue,
      newValue: state.computed.newValue,
    };
  }
}
