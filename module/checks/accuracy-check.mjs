import { CheckHooks } from './check-hooks.mjs';
import { CheckConfiguration } from './check-configuration.mjs';
import { CHECK_ROLL } from './default-section-order.mjs';
import { CommonSections } from './common-sections.mjs';

/**
 * Combat attack: 2d10 + stats.hit + item.toHit vs the target's Avoid.
 */

/** @type {PrepareCheckHook} */
const onPrepareCheck = (check, actor, item) => {
  if (check.type !== 'accuracy') return;

  const itemToHit = item?.system?.toHit ?? 0;
  const actorHit = actor?.system?.stats?.hit?.value ?? 0;
  check.tick = actorHit + itemToHit;

  const config = CheckConfiguration.configure(check);
  config.setTargetedDefense('avoid').setDefaultTargets();
  if (item?.name) config.setLabel(item.name);

  const itemDamage = item?.system?.damage;
  if (itemDamage) {
    const pow = actor?.system?.attributes?.pow?.value ?? 0;
    config.setDamage({
      amount: pow + (itemDamage.value ?? 0),
      type: itemDamage.type ?? 'physical',
    });
  }
};

/** @type {ProcessCheckHook} */
const onProcessCheck = (result) => {
  if (result.type !== 'accuracy') return;
  CheckConfiguration.configure(result).updateTargetResults();
};

/** @type {RenderCheckHook} */
const onRenderCheck = (data, result, actor, item) => {
  if (result.type !== 'accuracy') return;
  const inspector = CheckConfiguration.inspect(result);
  CommonSections.rollResult(data, result, CHECK_ROLL);
  CommonSections.targets(data, inspector, { hideTn: true, hideLabel: true });
  CommonSections.outcome(data, result, inspector, { hideVerdict: true });
  CommonSections.description(data, item?.system?.description, {
    relativeTo: item,
  });
};

const initialize = () => {
  Hooks.on(CheckHooks.prepareCheck, onPrepareCheck);
  Hooks.on(CheckHooks.processCheck, onProcessCheck);
  Hooks.on(CheckHooks.renderCheck, onRenderCheck);
};

export const AccuracyCheck = Object.freeze({ initialize });
