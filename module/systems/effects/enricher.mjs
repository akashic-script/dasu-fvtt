/**
 * @fileoverview Effect Enricher
 *
 * Provides clickable links in text to apply status effects on actors with optional duration.
 *
 * Syntax:
 * - [[/effect effectId]] - Toggle effect
 * - [[/effect effectId 3t]] - Apply with 3 turns duration
 * - [[/effect effectId 2r]] - Apply with 2 rounds duration
 * - [[/effect effectId combat-end]] - Apply until combat ends
 * - [[/effect effectId up]] - Add stack (stackable effects)
 * - [[/effect effectId down]] - Remove stack (stackable effects)
 * - [[/effect effectId + 3t]] - Add stack with 3 turns
 * - [[/effect effectId -]] - Remove stack (shorthand)
 *
 * States: on, off, toggle, up (+), down (-)
 * Durations: Nt (turns), Nr (rounds), combat-end (ce)
 *
 * Modifier Keys:
 * - Left-click: Apply immediately
 * - Ctrl+Click: Open dialog with prepopulated fields
 *
 * @example
 * [[/effect bleeding]]
 * [[/effect stunned 3t]]
 * [[/effect poisoned 2r]]
 * [[/effect burning combat-end]]
 * [[/effect bleeding up]]
 * [[/effect bleeding + 2r]]
 */
/* global canvas */
import {
  createEnricherLink,
  createEnricherInitializer,
  getTargets,
  getControlledTokens,
  validateEnricherValue,
  wrapEnricher,
  getSourceActor,
} from '../enrichers/enricher-base.mjs';

import { EffectProcessor } from './processor.mjs';
import { StatusEffectDialog } from '../../ui/dialogs/status-effect-dialog.mjs';

/**
 * Valid effect states
 */
const EFFECT_STATES = ['on', 'off', 'toggle', 'up', 'down', '+', '-'];

/**
 * Parse duration string into structured data
 *
 * @param {string} str - Duration string (e.g., "3t", "2r", "combat-end")
 * @returns {Object|null} Parsed duration or null
 * @private
 */
function _parseDuration(str) {
  if (!str) return null;

  // Special durations
  const specialDurations = {
    'combat-end': 'removeOnCombatEnd',
    ce: 'removeOnCombatEnd',
  };

  if (specialDurations[str.toLowerCase()]) {
    return {
      type: 'special',
      value: specialDurations[str.toLowerCase()],
    };
  }

  // Numeric durations (3t, 2r)
  const match = str.match(/^(\d+)([tr])$/i);
  if (!match) return null;

  const [, value, unit] = match;
  return {
    type: 'numeric',
    value: parseInt(value),
    unit: unit.toLowerCase() === 't' ? 'turns' : 'rounds',
  };
}

/**
 * Parse effect enricher match
 *
 * @param {RegExpMatchArray} match - Regex match result
 * @returns {Object} Parsed effect data
 * @private
 */
function _parseEffectEnricher(match) {
  const [, effectId, stateOrDuration = 'toggle', optionalDuration] = match;

  // Validate effect exists in status conditions
  const effect = Object.values(CONFIG.DASU_STATUS_CONDITIONS || {}).find(
    (condition) => condition.id === effectId
  );

  if (!effect) {
    console.warn(`Unknown effect ID: ${effectId}`);
    return null;
  }

  // Determine state and duration
  let state = 'toggle';
  let duration = null;

  // Check if stateOrDuration is a state
  if (EFFECT_STATES.includes(stateOrDuration)) {
    state = stateOrDuration;
    duration = _parseDuration(optionalDuration);
  } else {
    // stateOrDuration is actually a duration
    duration = _parseDuration(stateOrDuration);
    // Check if optionalDuration is a state (for patterns like "[[/effect bleeding + 3t]]")
    if (optionalDuration && EFFECT_STATES.includes(optionalDuration)) {
      state = optionalDuration;
    }
  }

  // Map shorthand states
  if (state === '+') state = 'up';
  if (state === '-') state = 'down';

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
    duration,
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
  const { effectId, state, duration, effect } = effectData;

  const effectName = game.i18n.localize(effect.name || effect.label);

  // Build display label with duration
  let labelText = effectName;
  if (duration) {
    if (duration.type === 'numeric') {
      const unitLabel =
        duration.unit === 'turns'
          ? duration.value === 1
            ? game.i18n.localize('DASU.Effect.Turn')
            : game.i18n.localize('DASU.Effect.Turns')
          : duration.value === 1
          ? game.i18n.localize('DASU.Effect.Round')
          : game.i18n.localize('DASU.Effect.Rounds');
      labelText += ` (${duration.value} ${unitLabel})`;
    } else if (duration.type === 'special') {
      labelText += ` (${game.i18n.localize('DASU.Effect.CombatEnd')})`;
    }
  }

  // Build tooltip
  let tooltipAction = 'Toggle';
  if (state === 'on') tooltipAction = 'Apply';
  else if (state === 'off') tooltipAction = 'Remove';
  else if (state === 'up') tooltipAction = 'Add Stack';
  else if (state === 'down') tooltipAction = 'Remove Stack';

  const tooltip = `${tooltipAction} ${effectName}${
    duration ? ' with duration' : ''
  }`;

  // Add state-specific class for styling
  const stateClass = `effect-state-${state}`;

  return createEnricherLink({
    cssClass: `effect-link ${stateClass}`,
    iconClass: effect.icon || 'fa-star',
    labelText,
    tooltip,
    dataset: {
      effectId,
      state,
      ...(duration && { duration: JSON.stringify(duration) }),
    },
  });
}

/**
 * Check if an effect is stackable by finding its base configuration
 *
 * @param {string} effectId - Effect ID from DASU_STATUS_CONDITIONS
 * @returns {Object|null} Stackable effect data or null
 * @private
 */
function _getStackableEffectData(effectId) {
  // Find the effect in status conditions
  const effect = Object.values(CONFIG.DASU_STATUS_CONDITIONS || {}).find(
    (condition) => condition.id === effectId
  );

  if (!effect) return null;

  // Check if the effect has stackable flags configured
  const flags = effect.flags?.dasu;
  if (flags?.stackable && flags?.stackId) {
    return {
      stackId: flags.stackId,
      maxStacks: flags.maxStacks,
      isStackable: true,
    };
  }

  return null;
}

/**
 * Add a stack to a stackable effect
 *
 * @param {Actor} actor - The actor to modify
 * @param {string} effectId - Effect ID from DASU_STATUS_CONDITIONS
 * @param {string} [origin] - Origin UUID for the effect
 * @returns {Promise<boolean>} True if stack was added
 * @private
 */
async function _addEffectStack(actor, effectId, origin = null) {
  if (!actor) return false;

  // Get the base effect configuration
  const effect = Object.values(CONFIG.DASU_STATUS_CONDITIONS || {}).find(
    (condition) => condition.id === effectId
  );

  if (!effect) {
    console.warn(`Effect ${effectId} not found in status conditions`);
    return false;
  }

  // Create effect data from the status condition
  const effectData = {
    name: game.i18n.localize(effect.name || effect.label),
    icon: effect.icon,
    statuses: [effectId],
    duration: foundry.utils.deepClone(effect.duration || {}),
    flags: foundry.utils.deepClone(effect.flags || {}),
  };

  // If there's an active combat and duration has turns/rounds, link it to the combat
  if (
    game.combat &&
    effectData.duration &&
    (effectData.duration.turns || effectData.duration.rounds)
  ) {
    effectData.duration.combat = game.combat.id;
  }

  // Add origin if provided
  if (origin) {
    effectData.origin = origin;
  }

  // Use actor's addStackableEffect method
  const result = await actor.addStackableEffect(effectData);
  return result !== null;
}

/**
 * Remove a stack from a stackable effect
 *
 * @param {Actor} actor - The actor to modify
 * @param {string} stackId - Stack ID to remove
 * @returns {Promise<boolean>} True if stack was removed
 * @private
 */
async function _removeEffectStack(actor, stackId) {
  if (!actor) return false;

  const stackCount = actor.getEffectStackCount(stackId);
  if (stackCount === 0) return false;

  await actor.removeEffectStack(stackId);
  return true;
}

/**
 * Apply or remove an effect from an actor
 *
 * @param {Actor} actor - The actor to modify
 * @param {string} effectId - Effect ID from DASU_STATUS_CONDITIONS
 * @param {string} state - Desired state ('on', 'off', 'toggle', 'up', 'down')
 * @param {Object|null} duration - Duration override from enricher
 * @param {boolean} isRightClick - Whether this is a right-click (for unstacking)
 * @param {string} [origin] - Origin UUID for the effect
 * @returns {Promise<void>}
 * @private
 */
async function _applyEffect(
  actor,
  effectId,
  state,
  duration = null,
  isRightClick = false,
  origin = null
) {
  if (!actor) return;

  // Get status condition config
  const statusCondition = CONFIG.DASU_STATUS_CONDITIONS?.[effectId];
  if (!statusCondition) {
    console.warn(`DASU | Effect Enricher | Unknown effect: ${effectId}`);
    return;
  }

  // Check if effect is stackable
  const stackableData = _getStackableEffectData(effectId);

  // Handle stack states (up/down)
  if (state === 'up' || state === 'down') {
    if (!stackableData?.isStackable) {
      console.warn(
        `DASU | Effect Enricher | Cannot use stack state on non-stackable effect: ${effectId}`
      );
      return;
    }

    if (state === 'up') {
      // Add stack with duration
      const effectData = _buildEffectData(statusCondition, effectId, duration);
      await EffectProcessor.applyEffect(actor, effectData, {
        toggle: false,
        origin,
      });
    } else if (state === 'down') {
      // Remove stack
      await _removeEffectStack(actor, stackableData.stackId);
    }
    return;
  }

  // Handle stackable effects with regular states
  if (stackableData?.isStackable) {
    if (isRightClick) {
      // Right-click: unstack by 1
      await _removeEffectStack(actor, stackableData.stackId);
    } else {
      // Left-click: add stack using EffectProcessor
      const effectData = _buildEffectData(statusCondition, effectId, duration);
      await EffectProcessor.applyEffect(actor, effectData, {
        toggle: false,
        origin,
      });
    }
  } else {
    // Handle non-stackable effect using EffectProcessor
    const effectData = _buildEffectData(statusCondition, effectId, duration);

    if (state === 'toggle') {
      await EffectProcessor.applyEffect(actor, effectData, {
        toggle: true,
        origin,
      });
    } else if (state === 'on') {
      const hasEffect = actor.effects.find((e) => e.statuses.has(effectId));
      if (!hasEffect) {
        await EffectProcessor.applyEffect(actor, effectData, {
          toggle: false,
          origin,
        });
      }
    } else if (state === 'off') {
      const hasEffect = actor.effects.find((e) => e.statuses.has(effectId));
      if (hasEffect) {
        await hasEffect.delete();
      }
    }
  }
}

/**
 * Build effect data from status condition
 * @private
 */
function _buildEffectData(statusCondition, statusId, durationOverride = null) {
  const effectData = {
    name: game.i18n.localize(statusCondition.name),
    icon: statusCondition.img,
    statuses: [statusId],
    duration: foundry.utils.deepClone(statusCondition.duration || {}),
    flags: foundry.utils.deepClone(statusCondition.flags || {}),
  };

  if (statusCondition.tint) {
    effectData.tint = statusCondition.tint;
  }

  if (statusCondition.description) {
    effectData.description = statusCondition.description;
  }

  if (statusCondition.changes) {
    effectData.changes = foundry.utils.deepClone(statusCondition.changes);
  }

  // Apply duration override if provided
  if (durationOverride) {
    if (durationOverride.type === 'numeric') {
      effectData.duration[durationOverride.unit] = durationOverride.value;
      // Link to combat if available
      if (game.combat) {
        effectData.duration.combat = game.combat.id;
      }
    } else if (durationOverride.type === 'special') {
      effectData.flags.dasu = effectData.flags.dasu || {};
      effectData.flags.dasu[durationOverride.value] = true;
    }
  }

  return effectData;
}

/**
 * Handle effect link clicks (left-click)
 *
 * @param {Event} event - Click event
 * @private
 */
async function _onEffectLinkClick(event) {
  event.preventDefault();

  const link = event.currentTarget;
  const effectId = link.dataset.effectId;
  const state = link.dataset.state || 'toggle';
  const duration = link.dataset.duration
    ? JSON.parse(link.dataset.duration)
    : null;

  // Check for Ctrl+Click to open dialog
  if (event.ctrlKey || event.metaKey) {
    await _openEffectDialog(effectId, state, duration, link);
    return;
  }

  // Get source actor from the enricher context
  const sourceActor = getSourceActor(link);
  const origin = sourceActor?.uuid || null;

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

  // Check if effect is stackable
  const stackableData = _getStackableEffectData(effectId);

  // Apply effect to each token's actor
  for (const token of tokensToProcess) {
    await _applyEffect(token.actor, effectId, state, duration, false, origin);
  }

  // Notification
  const effect = Object.values(CONFIG.DASU_STATUS_CONDITIONS || {}).find(
    (condition) => condition.id === effectId
  );
  const effectName = game.i18n.localize(
    effect?.name || effect?.label || effectId
  );

  if (stackableData?.isStackable || state === 'up') {
    // Stack-specific notification for left-click
    ui.notifications.info(
      `${effectName} stack added to ${tokensToProcess.length} token(s)`
    );
  } else if (state === 'down') {
    ui.notifications.info(
      `${effectName} stack removed from ${tokensToProcess.length} token(s)`
    );
  } else {
    // Original notification for non-stackable effects
    const action =
      state === 'on' ? 'applied' : state === 'off' ? 'removed' : 'toggled';
    ui.notifications.info(
      `${effectName} ${action} on ${tokensToProcess.length} token(s)`
    );
  }
}

/**
 * Open status effect dialog with prepopulated fields
 *
 * @param {string} effectId - Effect ID
 * @param {string} state - State (toggle, on, off, up, down)
 * @param {Object|null} duration - Duration data
 * @param {HTMLElement} link - The enricher link element
 * @private
 */
async function _openEffectDialog(effectId, state, duration, link) {
  // Get the effect configuration
  const effect = Object.values(CONFIG.DASU_STATUS_CONDITIONS || {}).find(
    (condition) => condition.id === effectId
  );

  if (!effect) {
    console.warn(`Unknown effect ID: ${effectId}`);
    return;
  }

  // Determine source actor from context
  let sourceActor = null;
  let isFromActorSheet = false;

  // First, check if we're in an actor sheet
  const sheetElement = link.closest('.sheet.actor');
  if (sheetElement) {
    const sheetApp = ui.windows[sheetElement.dataset.appid];
    if (sheetApp?.actor) {
      sourceActor = sheetApp.actor;
      isFromActorSheet = true;
    }
  }

  // Try to get source from chat message context
  if (!sourceActor) {
    const messageActor = getSourceActor(link);
    if (messageActor) {
      sourceActor = messageActor;
    }
  }

  // Fallback to selected token
  if (!sourceActor) {
    const controlled = canvas.tokens?.controlled || [];
    if (controlled.length === 1) {
      sourceActor = controlled[0].actor;
    }
    // Fallback to user's character
    else if (game.user.character) {
      sourceActor = game.user.character;
    }
  }

  // Get targets
  const targets = getTargets();
  let tokensToProcess = targets;

  // If no targets and we're NOT from an actor sheet, fall back to controlled tokens
  if (tokensToProcess.length === 0 && !isFromActorSheet) {
    const controlled = getControlledTokens();
    tokensToProcess = controlled;
  }

  // If still no targets and not from actor sheet, warn
  if (tokensToProcess.length === 0 && !isFromActorSheet) {
    ui.notifications.warn('No targets or controlled tokens selected');
    return;
  }

  // Prepare dialog options with prepopulated values
  // Filter out the source actor from targets if present
  const filteredTargets = sourceActor
    ? tokensToProcess.filter((t) => t.actor?.uuid !== sourceActor.uuid)
    : tokensToProcess;

  const dialogOptions = {
    statusId: effectId,
    statusCondition: effect,
    targets: filteredTargets,
    sourceActor: sourceActor
      ? {
          uuid: sourceActor.uuid,
          name: sourceActor.name,
          img: sourceActor.img,
        }
      : null,
  };

  // Open the dialog
  await StatusEffectDialog.show(dialogOptions);
}

/**
 * Handle effect link context menu (right-click)
 *
 * @param {Event} event - Context menu event
 * @private
 */
async function _onEffectLinkContextMenu(event) {
  event.preventDefault();

  const link = event.currentTarget;
  const effectId = link.dataset.effectId;
  const duration = link.dataset.duration
    ? JSON.parse(link.dataset.duration)
    : null;

  // Check if effect is stackable - only handle right-click for stackable effects
  const stackableData = _getStackableEffectData(effectId);
  if (!stackableData?.isStackable) {
    return; // Non-stackable effects don't respond to right-click
  }

  // Get source actor from the enricher context (for origin)
  const sourceActor = getSourceActor(link);
  const origin = sourceActor?.uuid || null;

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

  // Remove stack from each token's actor
  for (const token of tokensToProcess) {
    await _applyEffect(token.actor, effectId, 'toggle', duration, true, origin);
  }

  // Notification
  const effect = Object.values(CONFIG.DASU_STATUS_CONDITIONS || {}).find(
    (condition) => condition.id === effectId
  );
  const effectName = game.i18n.localize(
    effect?.name || effect?.label || effectId
  );

  ui.notifications.info(
    `${effectName} stack removed from ${tokensToProcess.length} token(s)`
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
  pattern:
    /\[\[\/effect\s+([^\s\]]+)(?:\s+([^\s\]]+))?(?:\s+([^\s\]]+))?\]\]/gi,
  enricher: wrapEnricher(enrichEffectMatch, 'effect'),
  selector: '.effect-link',
  clickHandler: _onEffectLinkClick,
  contextMenuHandler: _onEffectLinkContextMenu,
});
