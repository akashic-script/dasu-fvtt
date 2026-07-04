import { CheckHooks } from './check-hooks.mjs';
import { CheckConfiguration } from './check-configuration.mjs';
import { CHECK_ROLL } from './default-section-order.mjs';
import { CommonSections } from './common-sections.mjs';
import { sumDamageBonus } from '../data/bonuses.mjs';

/**
 * Combat attack: 2d10 + stats.hit + item.toHit vs the target's Avoid.
 */

/** @type {PrepareCheckHook} */
const onPrepareCheck = (check, actor, item) => {
  if (check.type !== 'accuracy') return;

  const itemToHit = item?.system?.toHit ?? 0;
  const actorHit = actor?.system?.stats?.hit?.value ?? 0;
  const bonuses = actor?.system?.bonuses;
  const hitKey = item?.system?.category;
  const toHitBonus =
    (bonuses?.toHit?.all ?? 0) + (hitKey ? bonuses?.toHit?.[hitKey] ?? 0 : 0);
  check.tick = actorHit + itemToHit + toHitBonus;

  const config = CheckConfiguration.configure(check);
  config.setTargetedDefense('avoid').setDefaultTargets();
  if (item?.name) config.setLabel(item.name);
  if (item?.system?.isInfinity) config.setAutoHit();

  const itemDamage = item?.system?.damage;
  if (itemDamage && item?.system?.category !== 'affliction') {
    const govern = item?.system?.govern ?? 'pow';
    const governValue = actor?.system?.attributes?.[govern]?.value ?? 0;
    const type = itemDamage.type ?? 'physical';
    const kind = item?.type === 'weapon' ? 'weapon' : (item?.system?.category ?? 'spell');
    const dmgBonus = sumDamageBonus(bonuses?.damage, { kind, type });
    config.setDamage({
      amount: governValue + (itemDamage.value ?? 0) + dmgBonus,
      type,
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
