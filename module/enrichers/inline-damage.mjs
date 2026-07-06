import { InlineHelper } from '../helpers/inline/inline-helper.mjs';
import { InlineDispatch } from '../helpers/inline/inline-dispatch.mjs';

/** `@DMG[<amount> <type>]{label}` inline damage. `wp` trait targets WP. */

const PATTERN = InlineHelper.compose(
  'DMG',
  '\\s*(?<amount>.+?)\\s+(?<type>\\w+)\\s*'
);

function enricher(match) {
  const amount = match.groups.amount;
  const type = match.groups.type?.toLowerCase();
  const label = match.groups.label;
  const traits = match.groups.traits;
  if (!(type in CONFIG.DASU.damageTypes)) return null;

  const anchor = document.createElement('a');
  anchor.classList.add('inline', 'inline-damage');
  anchor.draggable = true;
  anchor.dataset.type = type;
  if (traits) anchor.dataset.traits = traits;
  anchor.setAttribute(
    'data-tooltip',
    game.i18n.format('DASU.Inline.Damage.Tooltip', { amount, type })
  );
  InlineHelper.appendIcon(anchor, 'fa-solid', 'fa-burst');
  if (label) {
    anchor.dataset.amount = amount;
    anchor.append(label);
  } else {
    InlineHelper.appendAmount(anchor, amount);
    anchor.append(` ${game.i18n.localize(CONFIG.DASU.damageTypes[type])}`);
  }
  return anchor;
}

function buildAction(ctx) {
  const value = InlineHelper.evaluateAmount(ctx.dataset.amount, ctx.sourceInfo);
  const type = ctx.dataset.type;
  const resource = ctx.dataset.traits?.split(',').includes('wp') ? 'wp' : 'hp';
  return {
    type: 'damage',
    input: { value, damageType: type, resource },
    summary: game.i18n.format('DASU.Inline.Damage.Summary', {
      amount: value,
      type: game.i18n.localize(CONFIG.DASU.damageTypes[type]),
    }),
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

export const InlineDamage = Object.freeze({
  enrichers: [{ id: 'DASUInlineDamage', pattern: PATTERN, enricher, onRender }],
});
