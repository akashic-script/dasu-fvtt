/**
 * @fileoverview Effect Enricher
 *
 * Provides clickable links in text to toggle status effects on actors.
 *
 * Syntax:
 * - [[/effect effectId]] - Toggle effect
 * - [[/effect effectId on]] - Apply effect
 * - [[/effect effectId off]] - Remove effect
 * - [[/effect effectId toggle]] - Toggle effect (explicit)
 *
 * @example
 * [[/effect bleeding]]
 * [[/effect stunned on]]
 * [[/effect poisoned off]]
 */

import {
  createEnricherLink,
  createEnricherInitializer,
  getTargets,
  getControlledTokens,
  validateEnricherValue,
  wrapEnricher,
} from './enricher-base.mjs';

/**
 * Valid effect states
 */
const EFFECT_STATES = ['on', 'off', 'toggle'];

/**
 * Parse effect enricher match
 *
 * @param {RegExpMatchArray} match - Regex match result
 * @returns {Object} Parsed effect data
 * @private
 */
function _parseEffectEnricher(match) {
  const [, effectId, state = 'toggle'] = match;

  // Validate effect exists in status conditions
  const effect = Object.values(CONFIG.DASU_STATUS_CONDITIONS || {}).find(
    (condition) => condition.id === effectId
  );

  if (!effect) {
    console.warn(`Unknown effect ID: ${effectId}`);
    return null;
  }

  // Validate state
  const validState = validateEnricherValue(
    state,
    EFFECT_STATES,
    'toggle',
    'Invalid effect state:'
  );

  return {
    effectId,
    state: validState,
    effect,
  };
}

/**
 * Create effect enricher link element
 *
 * @param {Object} effectData - Parsed effect data
 * @returns {HTMLElement} Effect link element
 * @private
 */
function _createEffectLink(effectData) {
  const { effectId, state, effect } = effectData;

  const effectName = game.i18n.localize(effect.name || effect.label);

  // Add state-specific class for styling
  const stateClass = `effect-state-${state}`;

  return createEnricherLink({
    cssClass: `effect-link ${stateClass}`,
    iconClass: effect.icon || 'fa-star',
    labelText: effectName,
    tooltip: `${
      state === 'toggle' ? 'Toggle' : state === 'on' ? 'Apply' : 'Remove'
    } ${effectName}`,
    dataset: {
      effectId,
      state,
    },
  });
}

/**
 * Apply or remove an effect from an actor
 *
 * @param {Actor} actor - The actor to modify
 * @param {string} effectId - Effect ID from DASU_STATUS_CONDITIONS
 * @param {string} state - Desired state ('on', 'off', 'toggle')
 * @returns {Promise<void>}
 * @private
 */
async function _applyEffect(actor, effectId, state) {
  if (!actor) return;

  const hasEffect = actor.effects.find((e) => e.statuses.has(effectId));

  if (state === 'toggle') {
    if (hasEffect) {
      await hasEffect.delete();
    } else {
      await actor.toggleStatusEffect(effectId, { active: true });
    }
  } else if (state === 'on') {
    if (!hasEffect) {
      await actor.toggleStatusEffect(effectId, { active: true });
    }
  } else if (state === 'off') {
    if (hasEffect) {
      await hasEffect.delete();
    }
  }
}

/**
 * Handle effect link clicks
 *
 * @param {Event} event - Click event
 * @private
 */
async function _onEffectLinkClick(event) {
  event.preventDefault();

  const link = event.currentTarget;
  const effectId = link.dataset.effectId;
  const state = link.dataset.state || 'toggle';

  // Get targets or controlled tokens
  const targets = getTargets();
  let tokensToProcess = targets;

  if (tokensToProcess.length === 0) {
    const controlled = getControlledTokens();
    if (controlled.length === 0) {
      ui.notifications.warn('No targets or controlled tokens selected');
      return;
    }
    tokensToProcess = controlled;
  }

  // Apply effect to each token's actor
  for (const token of tokensToProcess) {
    await _applyEffect(token.actor, effectId, state);
  }

  // Notification
  const effect = Object.values(CONFIG.DASU_STATUS_CONDITIONS || {}).find(
    (condition) => condition.id === effectId
  );
  const effectName = game.i18n.localize(
    effect?.name || effect?.label || effectId
  );
  const action =
    state === 'on' ? 'applied' : state === 'off' ? 'removed' : 'toggled';

  ui.notifications.info(
    `${effectName} ${action} on ${tokensToProcess.length} token(s)`
  );
}

/**
 * Effect enricher function
 *
 * @param {RegExpMatchArray} match - Regex match
 * @param {Object} options - Enrichment options
 * @returns {Promise<HTMLElement|null>} Enriched element or null
 */
async function enrichEffectMatch(match, options) {
  const effectData = _parseEffectEnricher(match);
  if (!effectData) return null;

  return _createEffectLink(effectData);
}

/**
 * Register the effect enricher
 * Exported function for system initialization
 */
export const registerEffectEnricher = createEnricherInitializer({
  name: 'Effect',
  pattern: /\[\[\/effect\s+([^\s\]]+)(?:\s+(on|off|toggle))?\]\]/gi,
  enricher: wrapEnricher(enrichEffectMatch, 'effect'),
  selector: '.effect-link',
  clickHandler: _onEffectLinkClick,
});
