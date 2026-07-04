import { CheckHooks } from './check-hooks.mjs';
import { CheckConfiguration } from './check-configuration.mjs';
import { CHECK_ROLL } from './default-section-order.mjs';
import { CommonSections } from './common-sections.mjs';

/**
 * Initiative: 2d10 + [DEX]. Summoners may instead use the tick of the skill
 * last used before combat; pass that via the configCallback, which can set
 * `check.skill` (the engine resolves the skill tick) or override `check.tick`.
 */

/** @type {RenderCheckHook} */
const onRenderCheck = (data, result, actor, item) => {
  if (result.type !== 'initiative') return;
  CommonSections.rollResult(data, result, CHECK_ROLL);
  CommonSections.outcome(data, result, CheckConfiguration.inspect(result));
};

const initialize = () => {
  Hooks.on(CheckHooks.renderCheck, onRenderCheck);
};

export const InitiativeCheck = Object.freeze({ initialize });
