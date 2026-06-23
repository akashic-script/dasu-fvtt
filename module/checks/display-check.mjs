import { CheckHooks } from './check-hooks.mjs';
import { CheckConfiguration } from './check-configuration.mjs';
import { CommonSections } from './common-sections.mjs';

/**
 * Display check: posts an item card with no roll, targets, or outcome.
 * Used by items that are used rather than rolled (restorative/affliction
 * abilities and generic items).
 */

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
  CheckConfiguration.configure(check).setLabel(label);
};

/** @type {RenderCheckHook} */
const onRenderCheck = (data, result, actor, item) => {
  if (result.type !== 'display') return;
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
