import { TargetResolver } from './target-resolver.mjs';
import { PipelineMessage } from './pipeline-message.mjs';
import { PipelineState } from './pipeline-state.mjs';

/**
 * Base class for application pipelines (damage / resource / effect).
 *
 * Turns an action + targets into one applied mutation and one result message
 * per target. Each message owns an undo/redo toggle that recomputes against the
 * target's live state on every flip. Subclasses implement the abstract methods;
 * the base owns the target loop, message creation, and the toggle lifecycle.
 *
 * @abstract
 */
export class Pipeline {
  // Message ids with an in-flight toggle (guards double-clicks / concurrent flips).
  #toggling = new Set();

  // Pipeline id; also stored in state.type and matched to route a message's toggle.
  static type = '';

  /** Pure: compute the per-target outcome from input. No mutation. @abstract */
  computeOutcome(input, target) {
    throw new Error(`${this.constructor.name} must implement computeOutcome`);
  }

  /** Mutate the target; return the data needed to reverse it. @abstract */
  async applyToTarget(outcome, target) {
    throw new Error(`${this.constructor.name} must implement applyToTarget`);
  }

  /** Reverse a previously-applied mutation. @abstract */
  async revert(revertData, target) {
    throw new Error(`${this.constructor.name} must implement revert`);
  }

  /** Path to the per-target result body partial. @abstract */
  get resultTemplate() {
    throw new Error(`${this.constructor.name} must implement resultTemplate`);
  }

  /** Template context for the result body partial. @abstract */
  getMessageData(state) {
    throw new Error(`${this.constructor.name} must implement getMessageData`);
  }

  /* --- owned by the base --- */

  /**
   * Apply the action to every resolved target, posting one result message each.
   * @param {object} [options]
   * @param {string} [options.uuid]  explicit target uuid (else targeted/selected)
   */
  async applyToTargets(input, source, { uuid } = {}) {
    const targets = await TargetResolver.resolveTargets({ uuid });
    if (!targets.length) {
      ui.notifications?.warn(game.i18n.localize('DASU.Pipeline.NoTargets'));
      return [];
    }

    const messages = [];
    for (const target of targets) {
      try {
        const outcome = this.computeOutcome(input, target);
        const revert = await this.applyToTarget(outcome, target);
        const state = {
          type: this.constructor.type,
          applied: true,
          source,
          target: { actorUuid: target.uuid },
          input,
          computed: outcome,
          revert,
        };
        messages.push(await PipelineMessage.post(this, state));
      } catch (err) {
        console.error(`${this.constructor.name} failed on ${target.uuid}`, err);
        ui.notifications?.error(
          game.i18n.format('DASU.Pipeline.ApplyFailed', { name: target.name })
        );
      }
    }
    return messages;
  }

  /**
   * Flip a result message between applied and reverted, recomputing against the
   * target's live state. On failure the stored state is untouched.
   * @returns {Promise<boolean>} whether the flip succeeded
   */
  async toggle(message) {
    if (this.#toggling.has(message.id)) return false;
    const state = PipelineState.read(message);
    if (!state) return false;
    const target = await TargetResolver.resolveActor(state.target.actorUuid);
    if (!target) {
      ui.notifications?.warn(game.i18n.localize('DASU.Pipeline.TargetMissing'));
      return false;
    }

    this.#toggling.add(message.id);
    try {
      if (state.applied) {
        await this.revert(state.revert, target);
        state.applied = false;
      } else {
        // Recompute against the target's current state so re-apply uses live values.
        const outcome = this.computeOutcome(state.input, target);
        state.revert = await this.applyToTarget(outcome, target);
        state.computed = outcome;
        state.applied = true;
      }
      await PipelineMessage.commit(this, message, state);
      return true;
    } catch (err) {
      console.error(`${this.constructor.name} toggle failed`, err);
      ui.notifications?.error(game.i18n.localize('DASU.Pipeline.ToggleFailed'));
      return false;
    } finally {
      this.#toggling.delete(message.id);
    }
  }
}
