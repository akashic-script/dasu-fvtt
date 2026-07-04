/**
 * Accessor over a pipeline result message's state.
 *
 * State is the message's own `system` data (the `pipeline` ChatMessage
 * subtype, {@link PipelineMessageModel}), not a flag. The shape:
 *
 * @typedef PipelineState
 * @property {string} type      pipeline type, e.g. 'damage' | 'resource' | 'effect'
 * @property {boolean} applied  whether the mutation is currently applied
 * @property {object} source    { actorUuid, itemUuid, name } provenance for localization
 * @property {object} target    { actorUuid }
 * @property {object} input     editable inputs (amount/type/cost/mode/effectUuid)
 * @property {object} computed  derived values (affinity, finalAmount), recomputable
 * @property {object} revert    data needed to reverse the apply
 */

/** ChatMessage subtype that carries pipeline state in its `system` data. */
const MESSAGE_TYPE = 'pipeline';

/** Read the pipeline state off a result message, or null if not a pipeline. */
function read(message) {
  if (message?.type !== MESSAGE_TYPE) return null;
  // A plain, serializable snapshot detached from the model.
  return message.system.toObject();
}

/** Persist the pipeline state on a result message. */
function write(message, state) {
  return message.update({ system: state });
}

export const PipelineState = Object.freeze({ read, write, type: MESSAGE_TYPE });
