import { CheckHooks } from './check-hooks.mjs';
import { CheckConfiguration } from './check-configuration.mjs';
import { CHECK_ROLL } from './default-section-order.mjs';
import { CommonSections } from './common-sections.mjs';

/**
 * Negotiation Tactic: 2d10 + stats.land + item.toLand vs the target's Defense.
 */

/** @type {PrepareCheckHook} */
const onPrepareCheck = (check, actor, item) => {
  if (check.type !== 'tactic') return;

  const itemToLand = item?.system?.toLand ?? 0;
  const actorLand = actor?.system?.stats?.land?.value ?? 0;
  check.tick = actorLand + itemToLand;

  const config = CheckConfiguration.configure(check);
  config.setTargetedDefense('defense').setDefaultTargets();
  if (item?.name) config.setLabel(item.name);
};

/** @type {ProcessCheckHook} */
const onProcessCheck = (result) => {
  if (result.type !== 'tactic') return;
  CheckConfiguration.configure(result).updateTargetResults();
};

/** @type {RenderCheckHook} */
const onRenderCheck = (data, result, actor, item) => {
  if (result.type !== 'tactic') return;
  const inspector = CheckConfiguration.inspect(result);
  CommonSections.rollResult(data, result, CHECK_ROLL);
  CommonSections.targets(data, inspector);
  CommonSections.outcome(data, result, inspector);
  CommonSections.description(data, item?.system?.description, {
    relativeTo: item,
  });
};

const initialize = () => {
  Hooks.on(CheckHooks.prepareCheck, onPrepareCheck);
  Hooks.on(CheckHooks.processCheck, onProcessCheck);
  Hooks.on(CheckHooks.renderCheck, onRenderCheck);
};

export const TacticCheck = Object.freeze({ initialize });
