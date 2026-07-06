import { InlineHelper } from '../helpers/inline/inline-helper.mjs';
import { InlineDispatch } from '../helpers/inline/inline-dispatch.mjs';

/** `@RESOURCE[<amount> <hp|wp> <cost|heal>]{label}` spend/restore a resource. */

const RESOURCES = new Set(['hp', 'wp']);
const OPS = new Set(['cost', 'heal']);

const PATTERN = InlineHelper.compose(
  'RESOURCE',
  '\\s*(?<amount>.+?)\\s+(?<resource>hp|wp)\\s+(?<op>cost|heal)\\s*'
);

function enricher(match) {
  const amount = match.groups.amount;
  const resource = match.groups.resource?.toLowerCase();
  const op = match.groups.op?.toLowerCase();
  const label = match.groups.label;
  if (!RESOURCES.has(resource) || !OPS.has(op)) return null;

  const anchor = document.createElement('a');
  anchor.classList.add('inline', `inline-resource`, `inline-resource--${op}`);
  anchor.draggable = true;
  anchor.dataset.resource = resource;
  anchor.dataset.op = op;
  anchor.setAttribute(
    'data-tooltip',
    game.i18n.format(
      `DASU.Inline.Resource.${op === 'cost' ? 'Cost' : 'Heal'}Tooltip`,
      {
        amount,
        resource: resource.toUpperCase(),
      }
    )
  );
  InlineHelper.appendIcon(
    anchor,
    'fa-solid',
    op === 'cost' ? 'fa-droplet-slash' : 'fa-heart'
  );
  if (label) {
    anchor.dataset.amount = amount;
    anchor.append(label);
  } else {
    InlineHelper.appendAmount(anchor, amount);
    anchor.append(` ${resource.toUpperCase()}`);
  }
  return anchor;
}

function buildAction(ctx) {
  const value = InlineHelper.evaluateAmount(ctx.dataset.amount, ctx.sourceInfo);
  const resource = ctx.dataset.resource;
  const op = ctx.dataset.op;
  return {
    type: 'resource',
    input: { value, resource, op },
    summary: game.i18n.format(
      `DASU.Inline.Resource.${op === 'cost' ? 'Cost' : 'Heal'}Summary`,
      { amount: value, resource: resource.toUpperCase() }
    ),
  };
}

function onRender(element) {
  const ctx = InlineHelper.getRenderContext(element);
  const anchor = ctx.target;
  if (!anchor) return;

  anchor.addEventListener('click', async (event) => {
    event.preventDefault();
    await InlineDispatch.dispatch(buildAction(ctx), ctx.sourceInfo);
  });
  anchor.addEventListener('dragstart', (event) => {
    InlineDispatch.setDragData(event, buildAction(ctx), ctx.sourceInfo);
  });
}

export const InlineResource = Object.freeze({
  enrichers: [
    { id: 'DASUInlineResource', pattern: PATTERN, enricher, onRender },
  ],
});
