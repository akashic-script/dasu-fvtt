import { CheckHooks } from './check-hooks.mjs';
import { CheckConfiguration } from './check-configuration.mjs';
import { CHECK_ROLL } from './default-section-order.mjs';
import { CommonSections } from './common-sections.mjs';

/**
 * Skill check: 2d10 + skill tick vs a GM difficulty threshold.
 */

/** @type {PrepareCheckHook} */
const onPrepareCheck = (check, actor) => {
  if (check.type !== 'skill') return;
  const skill = actor?.system?.skills?.[check.skill];
  if (skill?.label) CheckConfiguration.configure(check).setLabel(skill.label);
};

/** @type {RenderCheckHook} */
const onRenderCheck = (data, result, actor, item) => {
  if (result.type !== 'skill') return;
  CommonSections.rollResult(data, result, CHECK_ROLL);
  CommonSections.outcome(data, result, CheckConfiguration.inspect(result));
};

const initialize = () => {
  Hooks.on(CheckHooks.prepareCheck, onPrepareCheck);
  Hooks.on(CheckHooks.renderCheck, onRenderCheck);
};

export const SkillCheck = Object.freeze({ initialize });
