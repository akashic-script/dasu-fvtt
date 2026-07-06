import { SYSTEM } from '../config.mjs';
import { getPipeline } from '../pipelines/_module.mjs';
import { TargetResolver } from '../pipelines/target-resolver.mjs';
import { InlineHelper } from './inline-helper.mjs';
import { InlineSourceInfo } from './inline-source.mjs';

/**
 * Turns an inline click or token drop into pipeline actions. Owned targets apply
 * now; unowned post a request card whose Apply button only a GM or owner can use.
 */

const REQUEST_FLAG = 'inlineRequest';
const CHECK_WRAPPER = `systems/${SYSTEM}/templates/chat/chat-check.hbs`;
const REQUEST_BODY = `systems/${SYSTEM}/templates/chat/inline-request.hbs`;
const DRAG_TYPE = 'dasu/inline';
const { renderTemplate } = foundry.applications.handlebars;

async function dispatch(action, sourceInfo) {
  // Selection denotes the source for inline refs, not the recipient: apply to
  // targeted tokens, else self. Never to the current canvas selection.
  const targets = await TargetResolver.resolveTargets({ allowSelf: true });
  if (!targets.length) {
    ui.notifications?.warn(game.i18n.localize('DASU.Pipeline.NoTargets'));
    return;
  }
  const source = InlineHelper.toPipelineSource(sourceInfo);
  for (const target of targets) await applyToTarget(action, source, target);
}

/** Apply to one actor: owned applies now, unowned posts a request card. */
async function applyToTarget(action, source, target) {
  const pipeline = getPipeline(action.type);
  if (!pipeline || !target) return;
  if (target.isOwner) {
    await pipeline.applyToTargets(action.input, source, { uuid: target.uuid });
  } else {
    await postRequest(action, source, target);
  }
}

/** Post a request card for a target the clicking user does not own. */
async function postRequest(action, source, target) {
  const state = {
    action,
    source,
    targetUuid: target.uuid,
    targetName: target.name,
    resolved: false,
  };
  const content = await renderRequest(state);
  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker(),
    flags: { [SYSTEM]: { [REQUEST_FLAG]: state } },
  });
}

/**
 * Render the request as a `display`-kind check card: the request body + Apply
 * button ride inside the standard DASU chat-check wrapper so it matches other
 * check messages.
 */
async function renderRequest(state) {
  const body = await renderTemplate(REQUEST_BODY, {
    sourceName: state.source?.name ?? game.i18n.localize('DASU.Inline.Unknown'),
    targetName: state.targetName,
    summary: state.action.summary,
    resolved: state.resolved,
  });
  return renderTemplate(CHECK_WRAPPER, {
    checkTitle: game.i18n.localize('DASU.Inline.Request.Title'),
    checkLabel: state.targetName,
    checkType: 'display',
    sections: [body],
    tags: [],
  });
}

/** Wire or gate the Apply button on a request card (GM/owner only). */
async function activateRequest(message, html) {
  const state = message.getFlag(SYSTEM, REQUEST_FLAG);
  if (!state) return;
  // Match the display-kind check card styling (accent, message framing).
  html.classList.add(
    'inline-request',
    'dasu-check-message',
    'dasu-check-message--display'
  );

  const btn = html.querySelector('[data-action="inlineApply"]');
  if (!btn) return;

  const target = await TargetResolver.resolveActor(state.targetUuid);
  const canApply = !state.resolved && (game.user.isGM || target?.isOwner);
  if (!canApply) {
    btn.disabled = true;
    return;
  }

  btn.addEventListener('click', async (event) => {
    event.preventDefault();
    if (btn.disabled) return;
    btn.disabled = true;
    const pipeline = getPipeline(state.action.type);
    if (!pipeline || !target) {
      btn.disabled = false;
      return;
    }
    await pipeline.applyToTargets(state.action.input, state.source, {
      uuid: state.targetUuid,
    });
    const next = { ...state, resolved: true };
    await message.update({
      flags: { [SYSTEM]: { [REQUEST_FLAG]: next } },
      content: await renderRequest(next),
    });
  });
}

/** Serialize an inline action + source onto a dragstart event. */
function setDragData(event, action, sourceInfo) {
  event.dataTransfer?.setData(
    'text/plain',
    JSON.stringify({
      type: DRAG_TYPE,
      action,
      source: InlineHelper.toPipelineSource(sourceInfo),
    })
  );
}

/** Parse a dropped payload back into an inline action, or null. */
function parseDragData(data) {
  if (data?.type !== DRAG_TYPE || !data.action) return null;
  return { action: data.action, source: data.source };
}

/**
 * Apply a dropped inline action to the token under the cursor. Owned targets
 * apply immediately; unowned ones post a request card. Returns false (sync) to
 * stop core's default drop handling; the apply itself runs fire-and-forget.
 */
function onDropCanvas(canvas, data) {
  const parsed = parseDragData(data);
  if (!parsed) return;

  const token = canvas.tokens?.placeables?.find((t) =>
    t.bounds.contains(data.x, data.y)
  );
  const target = token?.actor;
  if (!target) {
    ui.notifications?.warn(game.i18n.localize('DASU.Pipeline.NoTargets'));
    return false;
  }
  applyToTarget(parsed.action, parsed.source, target).catch((err) =>
    console.error('DASU | inline drop apply failed', err)
  );
  return false;
}

/** Register the request-card renderer and canvas-drop handler. Call once. */
function initialize() {
  Hooks.on('renderChatMessageHTML', (message, html) => {
    if (message.getFlag(SYSTEM, REQUEST_FLAG)) activateRequest(message, html);
  });
  Hooks.on('dropCanvasData', onDropCanvas);
}

export const InlineDispatch = Object.freeze({
  dispatch,
  setDragData,
  initialize,
});
