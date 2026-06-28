import { SYSTEM } from '../config.mjs';
import { PipelineState } from './pipeline-state.mjs';
import { TargetResolver } from './target-resolver.mjs';

const { renderTemplate } = foundry.applications.handlebars;
const SHELL = `systems/${SYSTEM}/templates/chat/pipeline/pipeline-result.hbs`;

// Pipeline instances keyed by static type, so a message button routes back.
const registry = new Map();

function register(pipeline) {
  registry.set(pipeline.constructor.type, pipeline);
}

/** Render the shared shell around a pipeline's body partial. */
async function renderContent(pipeline, state) {
  const target = await TargetResolver.resolveActor(state.target.actorUuid);
  const body = await renderTemplate(pipeline.resultTemplate, {
    ...(await pipeline.getMessageData(state)),
    state,
  });
  return renderTemplate(SHELL, {
    type: state.type,
    applied: state.applied,
    targetName: target?.name ?? state.target.actorUuid,
    targetImg: target?.img ?? 'icons/svg/mystery-man.svg',
    sourceName: state.source?.name ?? '',
    body,
  });
}

/**
 * Create the per-target result message. State lives in the message's `system`
 * data; `content` is a projection of it, re-derived on every update.
 */
async function post(pipeline, state) {
  const source = state.source?.actorUuid
    ? await TargetResolver.resolveActor(state.source.actorUuid)
    : null;
  const content = await renderContent(pipeline, state);
  return ChatMessage.create({
    type: PipelineState.type,
    system: state,
    speaker: ChatMessage.getSpeaker({ actor: source ?? undefined }),
    content,
  });
}

/** Persist new state and its re-derived content in one update, after a toggle. */
async function commit(pipeline, message, state) {
  const content = await renderContent(pipeline, state);
  return message.update({ system: state, content });
}

/** Wire the undo/redo button on a rendered result message. */
async function activate(message, html) {
  const state = PipelineState.read(message);
  if (!state) return;
  html.classList.add('pipeline-message', `pipeline-message--${state.type}`);

  const deleteBtn = html.querySelector('.message-delete');
  const cardHeader = html.querySelector('.pipeline-card__fieldset .dasu-fieldset__header');
  if (deleteBtn && cardHeader) cardHeader.append(deleteBtn);

  // Clicking the target avatar opens its sheet, if the user can view it.
  const avatar = html.querySelector('.pipeline-card__avatar');
  if (avatar) {
    const actor = await TargetResolver.resolveActor(state.target.actorUuid);
    if (actor?.sheet && actor.testUserPermission?.(game.user, 'LIMITED')) {
      avatar.style.cursor = 'pointer';
      avatar.addEventListener('click', () => actor.sheet.render(true));
    }
  }

  const pipeline = registry.get(state.type);
  if (!pipeline) return;

  const btn = html.querySelector('[data-action="pipelineToggle"]');
  if (!btn) return;

  const target = await TargetResolver.resolveActor(state.target.actorUuid);
  if (!target?.isOwner) {
    btn.disabled = true;
    return;
  }
  btn.addEventListener('click', async (event) => {
    event.preventDefault();
    if (btn.disabled) return;
    btn.disabled = true;
    // On success the message re-renders with a fresh button; on failure (or a
    // no-op like a missing target) re-enable so the user can retry.
    const ok = await pipeline.toggle(message);
    if (!ok) btn.disabled = false;
  });
}

export const PipelineMessage = Object.freeze({
  register,
  post,
  commit,
  activate,
});
