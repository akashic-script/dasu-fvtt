import { InlineHelper } from '../helpers/inline/inline-helper.mjs';
import { InlineDispatch } from '../helpers/inline/inline-dispatch.mjs';

/**
 * `@EFFECT[<idOrUuid> <3t|3r>]{label}` apply an Active Effect via EffectPipeline.
 * The reference is either a known system status id (e.g. `bleeding`) or an
 * ActiveEffect UUID; the status id path snapshots the caster like the old
 * `@STATUS` command did.
 */

const PATTERN = InlineHelper.compose(
  'EFFECT',
  `(?<ref>[\\w.]+)${InlineHelper.durationPattern}`
);

/** Small square icon image for a status/effect chip. */
function appendImg(anchor, src) {
  if (!src) return;
  const img = document.createElement('img');
  img.src = src;
  img.width = img.height = 16;
  img.style.margin = '0 2px -3px';
  anchor.append(img);
}

/** Render a chip for a known status id. */
function renderStatus(anchor, def, id, label, duration) {
  anchor.classList.add('inline', 'inline-status');
  anchor.dataset.ref = id;
  anchor.dataset.kind = 'status';
  const name = game.i18n.localize(def.name ?? id);
  anchor.setAttribute(
    'data-tooltip',
    game.i18n.format('DASU.Inline.Status.Tooltip', { name })
  );
  appendImg(anchor, def.img);
  anchor.append(label ?? name);
  if (duration) anchor.append(` (${duration})`);
  return anchor;
}

async function enricher(match) {
  const ref = match.groups.ref;
  const label = match.groups.label;
  const duration = match.groups.duration;

  const anchor = document.createElement('a');
  anchor.draggable = true;
  if (duration) anchor.dataset.duration = duration;

  const statusDef = CONFIG.DASU.statusEffectIndex?.[ref];
  if (statusDef) return renderStatus(anchor, statusDef, ref, label, duration);

  anchor.dataset.ref = ref;
  anchor.dataset.kind = 'effect';
  const effect = await fromUuid(ref).catch(() => null);
  if (!effect) {
    anchor.classList.add('inline', 'inline-broken');
    InlineHelper.appendIcon(anchor, 'fa-solid', 'fa-link-slash');
    anchor.append(game.i18n.localize('DASU.Inline.Effect.Invalid'));
    return anchor;
  }

  anchor.classList.add('inline', 'inline-effect');
  anchor.setAttribute(
    'data-tooltip',
    game.i18n.format('DASU.Inline.Effect.Tooltip', { name: effect.name })
  );
  appendImg(anchor, effect.img);
  anchor.append(label ?? effect.name);
  if (duration) anchor.append(` (${duration})`);
  return anchor;
}

/** Build the effect action for a status id or an effect UUID. */
function buildAction(ctx, name) {
  const ref = ctx.dataset.ref;
  const duration = InlineHelper.parseDuration(ctx.dataset.duration);
  const sourceActorUuid = ctx.sourceInfo.actorUuid;

  if (ctx.dataset.kind === 'status') {
    const def = CONFIG.DASU.statusEffectIndex?.[ref];
    if (!def) return null;
    const statusName = game.i18n.localize(def.name ?? ref);
    const effectData = {
      name: statusName,
      img: def.img,
      statuses: [ref],
      flags: { dasu: { statusId: ref } },
    };
    if (duration) effectData.duration = duration;
    return {
      type: 'effect',
      input: { effectData, sourceActorUuid },
      summary: game.i18n.format('DASU.Inline.Status.Summary', {
        name: statusName,
      }),
    };
  }

  const input = { effectUuid: ref, sourceActorUuid };
  // Inline duration overrides the source effect's own (applied in the pipeline).
  if (duration) input.duration = duration;
  return {
    type: 'effect',
    input,
    summary: game.i18n.format('DASU.Inline.Effect.Summary', { name }),
  };
}

async function onRender(element) {
  const ctx = InlineHelper.getRenderContext(element);
  const anchor = ctx.target;
  if (!anchor || anchor.classList.contains('inline-broken')) return;

  // Effect chips resolve their name from the UUID; status chips are self-named.
  let name = ctx.dataset.ref;
  if (ctx.dataset.kind === 'effect') {
    const effect = await fromUuid(ctx.dataset.ref).catch(() => null);
    if (!effect) return;
    name = effect.name;
  }

  anchor.addEventListener('click', async (event) => {
    event.preventDefault();
    const action = buildAction(ctx, name);
    if (action) await InlineDispatch.dispatch(action, ctx.sourceInfo);
  });
  anchor.addEventListener('dragstart', (event) => {
    const action = buildAction(ctx, name);
    if (action) InlineDispatch.setDragData(event, action, ctx.sourceInfo);
  });
}

export const InlineEffect = Object.freeze({
  enrichers: [{ id: 'DASUInlineEffect', pattern: PATTERN, enricher, onRender }],
});
