import { CHECK_RESULT, ChatSectionOrder } from './default-section-order.mjs';
import { SYSTEM } from '../helpers/config.mjs';

const tpl = (name) => `systems/${SYSTEM}/templates/chat/partials/${name}.hbs`;

/**
 * Shared chat-section builders. Per-type render hooks call these to push
 * standardized sections into the render data, keeping each check type small.
 */
export const CommonSections = Object.freeze({
  /**
   * The dice + tick + modifier breakdown and total.
   * @param {DASURenderData} data
   * @param {CheckResult} result
   * @param {number} order
   */
  rollResult(data, result, order) {
    data.sections.push({
      partial: tpl('chat-check-roll'),
      order,
      data: {
        dice: result.dice,
        droppedDice: result.droppedDice,
        tick: result.tick,
        modifiers: result.modifiers,
        modifierTotal: result.modifierTotal,
        total: result.result,
        critical: result.critical,
        snakeEyes: result.snakeEyes,
        critThreshold: result.critThreshold,
      },
    });
  },

  /**
   * Per-target hit/miss rows for accuracy/tactic checks.
   * @param {DASURenderData} data
   * @param {import('./check-configuration.mjs').CheckConfiguration} inspector
   */
  targets(data, inspector, { hideTn = false, hideLabel = false } = {}) {
    const targets = inspector.getTargets();
    if (!targets.length) return;
    const damage = inspector.getDamage();
    data.sections.push({
      partial: tpl('chat-check-targets'),
      order: ChatSectionOrder.details,
      data: {
        defense: inspector.getTargetedDefense(),
        targets,
        hasTargetActions: true,
        hideTn,
        hideLabel,
      },
    });
  },

  /**
   * Item description, enriched and rendered inside a fieldset panel.
   * @param {DASURenderData} data
   * @param {string} raw     Raw (unenriched) description HTML.
   * @param {object} [options]
   * @param {Document} [options.relativeTo]  Enrichment context (rolldata/secrets).
   * @param {string} [options.label]
   */
  description(data, raw, { relativeTo, label } = {}) {
    if (!raw) return;
    data.sections.push(async () => {
      const TextEditor = foundry.applications.ux.TextEditor.implementation;
      const html = await TextEditor.enrichHTML(raw, {
        relativeTo,
        rollData: relativeTo?.getRollData?.() ?? {},
        secrets: relativeTo?.isOwner ?? false,
      });
      return {
        partial: tpl('chat-check-description'),
        order: ChatSectionOrder.addendum,
        data: { html, label },
      };
    });
  },

  /**
   * Success/failure (and crit/snake-eyes) summary line.
   * @param {DASURenderData} data
   * @param {CheckResult} result
   * @param {import('./check-configuration.mjs').CheckConfiguration} inspector
   */
  outcome(data, result, inspector, { hideVerdict = false } = {}) {
    const success = inspector.isSuccess();
    const damage = inspector.getDamage();
    const hasVerdict = !hideVerdict && success != null;
    if (!hasVerdict && !damage) return;
    data.sections.push({
      partial: tpl('chat-check-outcome'),
      order: CHECK_RESULT,
      data: {
        tn: inspector.getTargetNumber(),
        success,
        critical: result.critical,
        snakeEyes: result.snakeEyes,
        damage,
        hideVerdict,
      },
    });
  },
});
