import { CheckHooks } from './check-hooks.mjs';
import { CheckConfiguration } from './check-configuration.mjs';
import { CHECK_ROLL } from './default-section-order.mjs';
import { CommonSections } from './common-sections.mjs';

/**
 * Attribute Check: 2d10 + attribute tick, meet/exceed the GM's TN.
 */

/** @type {RenderCheckHook} */
const onRenderCheck = (data, result, actor, item) => {
  if (result.type !== 'attribute') return;
  CommonSections.rollResult(data, result, CHECK_ROLL);
  const inspector = CheckConfiguration.inspect(result);
  CommonSections.outcome(data, result, inspector);
};

const initialize = () => {
  Hooks.on(CheckHooks.renderCheck, onRenderCheck);
};

export const AttributeCheck = Object.freeze({ initialize });
