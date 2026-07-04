import { CheckHooks } from './check-hooks.mjs';
import { CheckConfiguration } from './check-configuration.mjs';
import { CHECK_ROLL } from './default-section-order.mjs';
import { CommonSections } from './common-sections.mjs';

/**
 * Open check: a straight 2d10 with no tick, vs a GM TN.
 */

/** @type {RenderCheckHook} */
const onRenderCheck = (data, result, actor, item) => {
  if (result.type !== 'open') return;
  CommonSections.rollResult(data, result, CHECK_ROLL);
  CommonSections.outcome(data, result, CheckConfiguration.inspect(result));
};

const initialize = () => {
  Hooks.on(CheckHooks.renderCheck, onRenderCheck);
};

export const OpenCheck = Object.freeze({ initialize });
