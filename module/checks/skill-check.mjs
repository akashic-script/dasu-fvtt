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

  // A skill ability seeds its name + threshold as tags and injects its description.
  const sa = result.additionalData?.skillAbility;
  if (sa) {
    if (sa.name) data.tags.unshift({ tag: sa.name });
    const thresholdTag =
      sa.thresholdType === 'fixed'
        ? {
            tag: 'DASU.SkillAbility.Threshold.Label',
            value: `TN ${sa.fixedTN}`,
          }
        : {
            tag: 'DASU.SkillAbility.Threshold.Label',
            value:
              sa.thresholdType === 'defense'
                ? 'DASU.SkillAbility.Threshold.Defense'
                : 'DASU.SkillAbility.Threshold.Avoid',
          };
    data.tags.push(thresholdTag);
    CommonSections.description(data, sa.description, {
      relativeTo: actor,
      label: sa.name,
    });
  }
};

const initialize = () => {
  Hooks.on(CheckHooks.prepareCheck, onPrepareCheck);
  Hooks.on(CheckHooks.renderCheck, onRenderCheck);
};

export const SkillCheck = Object.freeze({ initialize });
