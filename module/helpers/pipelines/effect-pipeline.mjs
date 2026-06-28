import { Pipeline } from './pipeline.mjs';
import { SYSTEM } from '../config.mjs';

/**
 * Grant an Active Effect to the target; revert deletes it.
 *
 * Asymmetric vs damage/resource: revert is a delete, and redo creates a fresh
 * effect (new id).
 */
export class EffectPipeline extends Pipeline {
  static type = 'effect';

  computeOutcome(input, target) {
    let effectData = input.effectData ?? null;
    let src = null;
    if (input.effectUuid) {
      src = fromUuidSync(input.effectUuid);
      if (src) {
        effectData = typeof src.toObject === 'function'
          ? src.toObject()
          : foundry.utils.deepClone(src._source ?? src);
      }
    }
    const description =
      src?.system?.description
      ?? effectData?.system?.description
      ?? effectData?.description
      ?? '';
    return {
      sourceUuid: input.effectUuid ?? null,
      effectData,
      name: effectData?.name ?? game.i18n.localize('DASU.Pipeline.ApplyEffect'),
      img: effectData?.img ?? 'icons/svg/aura.svg',
      description,
    };
  }

  async applyToTarget(outcome, target) {
    if (!outcome.effectData) throw new Error('EffectPipeline: no effect data to apply');
    const [created] = await target.createEmbeddedDocuments('ActiveEffect', [
      outcome.effectData,
    ]);
    return { effectId: created?.id ?? null };
  }

  async revert(revertData, target) {
    const id = revertData?.effectId;
    // Tolerate a missing effect (manually deleted between apply and revert).
    if (!id || !target.effects?.get(id)) return;
    await target.deleteEmbeddedDocuments('ActiveEffect', [id]);
  }

  get resultTemplate() {
    return `systems/${SYSTEM}/templates/chat/pipeline/body-effect.hbs`;
  }

  async getMessageData(state) {
    const c = state.computed;
    const description = c.description
      ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(
          c.description,
          { secrets: false }
        )
      : '';
    // Prefer the snapshotted effectData duration; zero values mean unset.
    const rawDur = c.effectData?.duration ?? {};
    const duration = _formatDuration(rawDur);
    return { name: c.name, description, duration };
  }
}

function _formatDuration(dur) {
  if (!dur) return null;
  if (dur.value && dur.units) {
    const key = dur.units === 'rounds'
      ? 'DASU.Pipeline.DurationRounds'
      : dur.units === 'turns'
        ? 'DASU.Pipeline.DurationTurns'
        : null;
    return key ? game.i18n.format(key, { n: dur.value }) : null;
  }
  return null;
}
