import { SYSTEM } from '../config.mjs';
import { InlineSourceInfo } from './inline-source.mjs';

/**
 * Shared infrastructure for inline `@NAME[...]` references: grammar, enricher
 * registration, source/render-context resolution, anchor builders.
 */

const labelPattern = '(\\{(?<label>.*?)\\})?';
const traitsPattern = '(\\|(?<traits>[a-zA-Z-,]+)\\|)?';

/** Build the RegExp for a `@NAME[required|traits|]{label}` reference. */
function compose(name, required) {
  return new RegExp(
    `@${name}\\[${required}${traitsPattern}\\]${labelPattern}`,
    'g'
  );
}

/** Whether an amount string needs roll-data context to resolve (has @ or dice). */
function isExpression(amount) {
  return (
    /[@d+\-*/() ]/.test(String(amount ?? '').trim()) && !/^\d+$/.test(amount)
  );
}

/** Resolve an amount (number or roll-data expression) to an int; 0 on failure. */
function evaluateAmount(amount, sourceInfo) {
  const raw = String(amount ?? '').trim();
  if (/^-?\d+$/.test(raw)) return parseInt(raw, 10);
  try {
    const rollData = sourceInfo?.getRollData?.() ?? {};
    const value = Roll.safeEval(Roll.replaceFormulaData(raw, rollData));
    return Number.isFinite(value) ? Math.floor(value) : 0;
  } catch (err) {
    console.warn(`DASU | inline amount "${raw}" failed to evaluate`, err);
    return 0;
  }
}

/** Optional inline duration sub-pattern: `3t` (turns) or `3r` (rounds). */
const durationPattern = '(\\s+(?<duration>\\d+[tr]))?';

/** Parse a `3t`/`3r` token into `{ value, units }`, or null. */
function parseDuration(token) {
  const m = /^(\d+)([tr])$/.exec(String(token ?? '').trim());
  if (!m) return null;
  return {
    value: Number(m[1]),
    units: m[2] === 'r' ? 'rounds' : 'turns',
  };
}

/** Append the amount text to an anchor. */
function appendAmount(anchor, amount) {
  anchor.dataset.amount = amount;
  anchor.append(
    isExpression(amount) ? game.i18n.localize('DASU.Inline.Variable') : amount
  );
}

/** Append a Font Awesome icon to an anchor. */
function appendIcon(anchor, ...classes) {
  const icon = document.createElement('i');
  icon.classList.add(...classes.flatMap((c) => c.split(/\s+/)));
  icon.style.marginLeft = '2px';
  anchor.append(icon);
  return icon;
}

/** Resolve the parent document (sheet or chat message) of an enriched element. */
function resolveDocument(element) {
  const chat = element.closest('li.chat-message, .chat-message');
  if (chat?.dataset.messageId) {
    return game.messages.get(chat.dataset.messageId) ?? null;
  }
  const appEl = element.closest('.application');
  if (appEl) {
    const app = foundry.applications.instances.get(appEl.id);
    if (app?.document) return app.document;
  }
  return null;
}

/** Click-time context for an enriched anchor: source, dataset, parent document. */
function getRenderContext(element) {
  const document = resolveDocument(element);
  const target = element.matches('a.inline')
    ? element
    : element.querySelector('a.inline');
  const sourceInfo = document
    ? InlineSourceInfo.determine(document, target)
    : InlineSourceInfo.none;
  return { document, target, sourceInfo, dataset: target?.dataset ?? {} };
}

/** Serializable `source` bag the pipelines expect. */
function toPipelineSource(sourceInfo) {
  return {
    actorUuid: sourceInfo.actorUuid,
    itemUuid: sourceInfo.itemUuid,
    name: sourceInfo.name,
  };
}

/** Register an inline command's enrichers (and drop handler). */
function registerCommand(command) {
  CONFIG.TextEditor.enrichers.push(...command.enrichers);
  if (command.onDropActor) {
    Hooks.on('dropActorSheetData', command.onDropActor);
  }
}

export const InlineHelper = Object.freeze({
  compose,
  durationPattern,
  parseDuration,
  isExpression,
  evaluateAmount,
  appendAmount,
  appendIcon,
  resolveDocument,
  getRenderContext,
  toPipelineSource,
  registerCommand,
  SYSTEM,
});
