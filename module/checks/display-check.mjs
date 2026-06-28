import { CheckHooks } from './check-hooks.mjs';
import { CheckConfiguration } from './check-configuration.mjs';
import { CommonSections } from './common-sections.mjs';
import { ChatSectionOrder } from './default-section-order.mjs';
import { SYSTEM } from '../helpers/config.mjs';

/**
 * Display check: posts an item card with no roll, targets, or outcome.
 * Used by items that are used rather than rolled (restorative/affliction
 * abilities, generic items, schemas, and bonds).
 */

const TARGETED_ITEM_TYPES = new Set(['ability', 'item']);

/** @type {PrepareCheckHook} */
const onPrepareCheck = (check, actor, item) => {
  if (check.type !== 'display') return;
  if (!item?.name) return;
  let label = item.name;
  if (item.type === 'schema') {
    const level = check.additionalData?.schemaLevel ?? item.system?.level ?? 1;
    label = `${item.name} ${game.i18n.format('DASU.Dialog.Roll.SchemaLevel', {
      level,
    })}`;
  }
  const configurer = CheckConfiguration.configure(check).setLabel(label);
  if (TARGETED_ITEM_TYPES.has(item.type)) configurer.setDefaultTargets();
};

/** @type {RenderCheckHook} */
const onRenderCheck = (data, result, actor, item) => {
  if (result.type !== 'display') return;

  if (item?.type === 'bond') {
    const rankKey = result.additionalData?.bondRank;
    const rank = item.system?.[rankKey];
    if (rank?.name) data.tags.push({ tag: rank.name });
    if (rank?.abilityType) {
      const typeLabel = `DASU.Bond.Ability.${rank.abilityType.replace(
        /^./,
        (c) => c.toUpperCase()
      )}`;
      data.tags.push({ tag: typeLabel });
    }

    let effect = null;
    try {
      if (rank?.effectUuid) effect = fromUuidSync(rank.effectUuid);
    } catch {
      effect = null;
    }
    if (effect?.description) {
      const effectName = effect.name;
      const rawDescription = effect.description;
      data.sections.push(async () => {
        const TextEditor = foundry.applications.ux.TextEditor.implementation;
        const html = await TextEditor.enrichHTML(rawDescription, {
          relativeTo: effect,
          secrets: false,
        });
        return {
          partial: `systems/${SYSTEM}/templates/chat/partials/chat-check-description.hbs`,
          order: ChatSectionOrder.addendum,
          data: { html, label: effectName },
        };
      });
    }
    return;
  }

  if (TARGETED_ITEM_TYPES.has(item?.type)) {
    const inspector = CheckConfiguration.inspect(result);
    CommonSections.targets(data, inspector, { hideTn: true, hideLabel: true });
  }

  let description = item?.system?.description;
  if (item?.type === 'schema') {
    const level = result.additionalData?.schemaLevel ?? item.system?.level ?? 1;
    description = item.system?.[`level${level}`]?.description;
  }
  CommonSections.description(data, description, { relativeTo: item });
};

const initialize = () => {
  Hooks.on(CheckHooks.prepareCheck, onPrepareCheck);
  Hooks.on(CheckHooks.renderCheck, onRenderCheck);
};

export const DisplayCheck = Object.freeze({ initialize });
