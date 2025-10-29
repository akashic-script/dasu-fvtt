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
 * - [[/effect bleeding 5t & infected 3t]] - Multiple effects with & separator
 * - [[/effect bleeding + 3t & infected + 2t]] - Multiple stackable effects
 * - [[/effect prompt]] - Opens dialog to customize effect before applying
 *
 * States: on, off, toggle, up, down, +, -
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
 * [[/effect bleeding 5t & infected 3t]]
 * [[/effect bleeding + 3t & infected + 2t]]
 * [[/effect prompt]]
 */
/* global canvas CONST */
import {
  createEnricherLink,
  createEnricherContainer,
  createEnricherInitializer,
  getTargets,
  getControlledTokens,
  parseMultipleInstances,
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
 * Special duration mappings
 */
const SPECIAL_DURATIONS = {
  'combat-end': 'removeOnCombatEnd',
  ce: 'removeOnCombatEnd',
};

/**
 * Valid change modes for custom effects
 */
const VALID_MODES = {
  add: CONST.ACTIVE_EFFECT_MODES.ADD,
  multiply: CONST.ACTIVE_EFFECT_MODES.MULTIPLY,
  override: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
  upgrade: CONST.ACTIVE_EFFECT_MODES.UPGRADE,
  downgrade: CONST.ACTIVE_EFFECT_MODES.DOWNGRADE,
  custom: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
};

/**
 * Parse duration string into structured data
 *
 * @param {string} str - Duration string (e.g., "3t", "2r", "combat-end")
 * @returns {Object|null} Parsed duration or null
 * @private
 */
function _parseDuration(str) {
  if (!str) return null;

  // Check for special durations
  const specialKey = SPECIAL_DURATIONS[str.toLowerCase()];
  if (specialKey) {
    return { type: 'special', value: specialKey };
  }

  // Parse numeric durations (3t, 2r)
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
 * Parse custom effect changes from text
 * Format: "key mode value" separated by pipes or commas
 * Example: "system.stats.hp.mod add 5" or "system.stats.hp.mod | add | 5"
 *
 * @param {string} changesText - Changes text from parentheses
 * @returns {Array<Object>} Array of change objects
 * @private
 */
function _parseCustomChanges(changesText) {
  if (!changesText) return [];

  const changeEntries = changesText.split(/[|,]/).map((s) => s.trim());
  const changes = [];

  for (const entry of changeEntries) {
    const parts = entry.trim().split(/\s+/);

    if (parts.length < 3) {
      console.warn(
        `Invalid change format: "${entry}". Expected "key mode value"`
      );
      continue;
    }

    const [key, mode, ...valueParts] = parts;
    const value = valueParts.join(' ');
    const modeValue = VALID_MODES[mode.toLowerCase()];

    if (modeValue === undefined) {
      console.warn(
        `Invalid change mode: "${mode}". Valid modes: ${Object.keys(
          VALID_MODES
        ).join(', ')}`
      );
      continue;
    }

    changes.push({ key, mode: modeValue, value, priority: null });
  }

  return changes;
}

/**
 * Parse a single effect instance from text
 *
 * @param {string} instanceText - Text for a single effect instance
 * @returns {Object|null} Parsed effect data or null if invalid
 * @private
 */
function _parseEffectInstance(instanceText) {
  const tokens = instanceText.trim().split(/\s+/);
  if (tokens.length === 0) return null;

  const effectId = tokens[0].toLowerCase();

  // Handle prompt mode
  if (effectId === 'prompt') {
    return {
      isPrompt: true,
      effectId: 'prompt',
      state: 'toggle',
      duration: null,
      effect: null,
    };
  }

  // Handle custom effect mode
  if (effectId === 'custom') {
    let effectName = 'Custom Effect';
    let remainingText = instanceText.substring(6).trim();

    // Extract quoted name if present
    const nameMatch = remainingText.match(/^["']([^"']+)["']\s*/);
    if (nameMatch) {
      effectName = nameMatch[1];
      remainingText = remainingText.substring(nameMatch[0].length);
    }

    // Extract changes from parentheses
    const changesMatch = remainingText.match(/\(([^)]+)\)/);
    if (!changesMatch) {
      console.warn('Custom effect must include changes in parentheses');
      return null;
    }

    const changes = _parseCustomChanges(changesMatch[1]);
    if (!changes.length) {
      console.warn('Invalid custom effect changes');
      return null;
    }

    // Extract duration after closing parenthesis
    const afterParens = remainingText
      .substring(remainingText.indexOf(')') + 1)
      .trim();
    const durationMatch = afterParens.match(/^(\d+[tr]|combat-end|ce)/i);
    const duration = durationMatch ? _parseDuration(durationMatch[1]) : null;

    return {
      isCustom: true,
      effectId: 'custom',
      effectName,
      state: 'on',
      duration,
      changes,
      effect: null,
    };
  }

  // Validate effect exists in status conditions
  const effect = Object.values(CONFIG.DASU_STATUS_CONDITIONS || {}).find(
    (condition) => condition.id === tokens[0]
  );

  if (!effect) {
    console.warn(`Unknown effect ID: ${tokens[0]}`);
    return null;
  }

  // Parse state and duration
  const [, stateOrDuration = 'toggle', optionalDuration] = tokens;
  let state = 'toggle';
  let duration = null;

  if (EFFECT_STATES.includes(stateOrDuration)) {
    state = stateOrDuration;
    duration = _parseDuration(optionalDuration);
  } else {
    duration = _parseDuration(stateOrDuration);
    if (optionalDuration && EFFECT_STATES.includes(optionalDuration)) {
      state = optionalDuration;
    }
  }

  // Map shorthand states
  if (state === '+') state = 'up';
  if (state === '-') state = 'down';

  const validState = validateEnricherValue(
    state,
    EFFECT_STATES,
    'toggle',
    'Invalid effect state:'
  );

  return { effectId: tokens[0], state: validState, duration, effect };
}

/**
 * Parse effect enricher match (supports multiple instances with &)
 *
 * @param {RegExpMatchArray} match - Regex match result
 * @returns {Array<Object>|null} Array of parsed effect data or null if all invalid
 * @private
 */
function _parseEffectEnricher(match) {
  const content = match[1].trim();
  const instanceTexts = parseMultipleInstances(content);

  const effectInstances = instanceTexts
    .map((text) => _parseEffectInstance(text))
    .filter((instance) => instance !== null);

  if (!effectInstances.length) {
    console.warn('No valid effect instances found in enricher:', match[0]);
    return null;
  }

  return effectInstances;
}

/**
 * Format duration text for display
 *
 * @param {Object} duration - Duration object
 * @returns {string} Formatted duration text
 * @private
 */
function _formatDurationText(duration) {
  if (!duration) return '';

  if (duration.type === 'numeric') {
    const unitKey =
      duration.unit === 'turns'
        ? duration.value === 1
          ? 'DASU.Effect.Turn'
          : 'DASU.Effect.Turns'
        : duration.value === 1
        ? 'DASU.Effect.Round'
        : 'DASU.Effect.Rounds';
    return ` (${duration.value} ${game.i18n.localize(unitKey)})`;
  }

  if (duration.type === 'special') {
    return ` (${game.i18n.localize('DASU.Effect.CombatEnd')})`;
  }

  return '';
}

/**
 * Create effect enricher link element
 *
 * @param {Object} effectData - Parsed effect data
 * @returns {HTMLElement} Effect link element
 * @private
 */
function _createEffectLink(effectData) {
  const {
    effectId,
    state,
    duration,
    effect,
    isPrompt,
    isCustom,
    changes,
    effectName,
  } = effectData;

  // Handle prompt mode
  if (isPrompt) {
    return createEnricherLink({
      cssClass: 'effect-link effect-prompt',
      iconClass: 'fa-edit',
      labelText: 'Status Effect',
      tooltip: 'Open dialog to select and apply status effect',
      dataset: { effectId: 'prompt', state: 'toggle', isPrompt: 'true' },
    });
  }

  // Handle custom effect mode
  if (isCustom) {
    const labelText = effectName + _formatDurationText(duration);
    const tooltip = `Apply ${effectName} with ${changes.length} change(s)`;

    return createEnricherLink({
      cssClass: 'effect-link effect-custom',
      iconClass: 'fa-magic',
      labelText,
      tooltip,
      dataset: {
        effectId: 'custom',
        state: 'on',
        isCustom: 'true',
        effectName,
        changes: JSON.stringify(changes),
        ...(duration && { duration: JSON.stringify(duration) }),
      },
    });
  }

  // Handle standard effects
  const localizedName = game.i18n.localize(effect.name || effect.label);
  const labelText = localizedName + _formatDurationText(duration);

  const tooltipAction =
    {
      on: 'Apply',
      off: 'Remove',
      up: 'Add Stack',
      down: 'Remove Stack',
      toggle: 'Toggle',
    }[state] || 'Toggle';

  let tooltip = `${tooltipAction} ${localizedName}${
    duration ? ' with duration' : ''
  }`;
  if (effect.description) {
    tooltip += `\n${game.i18n.localize(effect.description)}`;
  }

  return createEnricherLink({
    cssClass: `effect-link effect-state-${state}`,
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
  const effect = Object.values(CONFIG.DASU_STATUS_CONDITIONS || {}).find(
    (condition) => condition.id === effectId
  );

  if (!effect) return null;

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
 * Build effect data from status condition
 *
 * @param {Object} statusCondition - Status condition config
 * @param {string} statusId - Status ID
 * @param {Object|null} durationOverride - Duration override
 * @returns {Object} Effect data
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

  if (statusCondition.tint) effectData.tint = statusCondition.tint;
  if (statusCondition.description)
    effectData.description = statusCondition.description;
  if (statusCondition.changes)
    effectData.changes = foundry.utils.deepClone(statusCondition.changes);

  // Apply duration override
  if (durationOverride) {
    if (durationOverride.type === 'numeric') {
      effectData.duration[durationOverride.unit] = durationOverride.value;
      if (game.combat) effectData.duration.combat = game.combat.id;
    } else if (durationOverride.type === 'special') {
      // Match the structure used in status conditions
      effectData.flags.dasu = effectData.flags.dasu || {};
      effectData.flags.dasu.specialDuration = durationOverride.value;
    }
  }

  return effectData;
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

  const statusCondition = CONFIG.DASU_STATUS_CONDITIONS?.[effectId];
  if (!statusCondition) {
    console.warn(`DASU | Effect Enricher | Unknown effect: ${effectId}`);
    return;
  }

  const stackableData = _getStackableEffectData(effectId);

  // Handle stack states
  if (state === 'up' || state === 'down') {
    if (!stackableData?.isStackable) {
      console.warn(
        `DASU | Effect Enricher | Cannot use stack state on non-stackable effect: ${effectId}`
      );
      return;
    }

    if (state === 'up') {
      const effectData = _buildEffectData(statusCondition, effectId, duration);
      await EffectProcessor.applyEffect(actor, effectData, {
        toggle: false,
        origin,
      });
    } else {
      await _removeEffectStack(actor, stackableData.stackId);
    }
    return;
  }

  // Handle stackable effects with regular states
  if (stackableData?.isStackable) {
    if (isRightClick) {
      await _removeEffectStack(actor, stackableData.stackId);
    } else {
      const effectData = _buildEffectData(statusCondition, effectId, duration);
      await EffectProcessor.applyEffect(actor, effectData, {
        toggle: false,
        origin,
      });
    }
    return;
  }

  // Handle non-stackable effects
  const effectData = _buildEffectData(statusCondition, effectId, duration);
  const hasEffect = actor.effects.find((e) => e.statuses.has(effectId));

  if (state === 'toggle') {
    await EffectProcessor.applyEffect(actor, effectData, {
      toggle: true,
      origin,
    });
  } else if (state === 'on' && !hasEffect) {
    await EffectProcessor.applyEffect(actor, effectData, {
      toggle: false,
      origin,
    });
  } else if (state === 'off' && hasEffect) {
    await hasEffect.delete();
  }
}

/**
 * Apply a custom effect with specified changes
 *
 * @param {Actor} actor - The actor to modify
 * @param {Array<Object>} changes - Array of change objects
 * @param {Object|null} duration - Duration data
 * @param {string} [origin] - Origin UUID for the effect
 * @param {string} [effectName] - Name for the effect
 * @returns {Promise<void>}
 * @private
 */
async function _applyCustomEffect(
  actor,
  changes,
  duration = null,
  origin = null,
  effectName = 'Custom Effect'
) {
  if (!actor) return;

  const effectData = {
    name: effectName,
    icon: 'icons/svg/aura.svg',
    changes,
    duration: {},
    flags: { dasu: {} },
  };

  // Apply duration
  if (duration) {
    if (duration.type === 'numeric') {
      effectData.duration[duration.unit] = duration.value;
      if (game.combat) effectData.duration.combat = game.combat.id;
    } else if (duration.type === 'special') {
      effectData.flags.dasu[duration.value] = true;
    }
  }

  await EffectProcessor.applyEffect(actor, effectData, {
    toggle: false,
    origin,
  });
}

/**
 * Get effect name from effect ID
 *
 * @param {string} effectId - Effect ID
 * @returns {string} Localized effect name
 * @private
 */
function _getEffectName(effectId) {
  const effect = Object.values(CONFIG.DASU_STATUS_CONDITIONS || {}).find(
    (condition) => condition.id === effectId
  );
  return game.i18n.localize(effect?.name || effect?.label || effectId);
}

/**
 * Show notification for effect application
 *
 * @param {string} effectName - Effect name
 * @param {string} action - Action performed
 * @param {number} count - Number of targets
 * @param {string} [targetName] - Single target name
 * @private
 */
function _showEffectNotification(effectName, action, count, targetName = null) {
  const target = targetName || `${count} token(s)`;
  ui.notifications.info(`${effectName} ${action} on ${target}`);
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
  const {
    effectId,
    state = 'toggle',
    duration,
    isPrompt,
    isCustom,
    effectName,
  } = link.dataset;
  const parsedDuration = duration ? JSON.parse(duration) : null;

  // Check for prompt mode or Ctrl+Click
  if (isPrompt === 'true' || event.ctrlKey || event.metaKey) {
    await _openEffectDialog(
      isPrompt === 'true' ? null : effectId,
      state,
      parsedDuration,
      link,
      isPrompt === 'true'
    );
    return;
  }

  const sourceActor = getSourceActor(link);
  const origin = sourceActor?.uuid || null;

  // Get targets with fallback to controlled tokens or source actor
  let tokensToProcess = getTargets();
  if (!tokensToProcess.length) {
    tokensToProcess = getControlledTokens();
    if (!tokensToProcess.length && !sourceActor) {
      ui.notifications.warn(
        'No targets, controlled tokens, or source actor available'
      );
      return;
    }
  }

  // Handle custom effects
  if (isCustom === 'true') {
    const changes = link.dataset.changes
      ? JSON.parse(link.dataset.changes)
      : [];
    if (!changes.length) {
      ui.notifications.warn('Custom effect has no changes defined');
      return;
    }

    const customName = effectName || 'Custom Effect';

    if (tokensToProcess.length) {
      for (const token of tokensToProcess) {
        await _applyCustomEffect(
          token.actor,
          changes,
          parsedDuration,
          origin,
          customName
        );
      }
      _showEffectNotification(customName, 'applied to', tokensToProcess.length);
    } else if (sourceActor) {
      await _applyCustomEffect(
        sourceActor,
        changes,
        parsedDuration,
        origin,
        customName
      );
      _showEffectNotification(customName, 'applied to', 1, sourceActor.name);
    }
    return;
  }

  // Apply standard effect
  const stackableData = _getStackableEffectData(effectId);
  const name = _getEffectName(effectId);

  if (tokensToProcess.length) {
    for (const token of tokensToProcess) {
      await _applyEffect(
        token.actor,
        effectId,
        state,
        parsedDuration,
        false,
        origin
      );
    }

    const action =
      stackableData?.isStackable || state === 'up'
        ? 'stack added to'
        : state === 'down'
        ? 'stack removed from'
        : state === 'on'
        ? 'applied to'
        : state === 'off'
        ? 'removed from'
        : 'toggled on';

    _showEffectNotification(name, action, tokensToProcess.length);
  } else if (sourceActor) {
    await _applyEffect(
      sourceActor,
      effectId,
      state,
      parsedDuration,
      false,
      origin
    );

    const action =
      stackableData?.isStackable || state === 'up'
        ? 'stack added to'
        : state === 'down'
        ? 'stack removed from'
        : state === 'on'
        ? 'applied to'
        : state === 'off'
        ? 'removed from'
        : 'toggled on';

    _showEffectNotification(name, action, 1, sourceActor.name);
  }
}

/**
 * Open status effect dialog with prepopulated fields
 *
 * @param {string|null} effectId - Effect ID (null for prompt mode)
 * @param {string} state - State (toggle, on, off, up, down)
 * @param {Object|null} duration - Duration data
 * @param {HTMLElement} link - The enricher link element
 * @param {boolean} isPrompt - True if called from prompt mode
 * @private
 */
async function _openEffectDialog(
  effectId,
  state,
  duration,
  link,
  isPrompt = false
) {
  // Get effect configuration if not in prompt mode
  let effect = null;
  if (effectId && !isPrompt) {
    effect = Object.values(CONFIG.DASU_STATUS_CONDITIONS || {}).find(
      (condition) => condition.id === effectId
    );
    if (!effect) {
      console.warn(`Unknown effect ID: ${effectId}`);
      return;
    }
  }

  // Determine source actor
  let sourceActor = null;
  let isFromActorSheet = false;

  const sheetElement = link.closest('.sheet.actor');
  if (sheetElement) {
    const sheetApp = ui.windows[sheetElement.dataset.appid];
    if (sheetApp?.actor) {
      sourceActor = sheetApp.actor;
      isFromActorSheet = true;
    }
  }

  if (!sourceActor) {
    sourceActor = getSourceActor(link);
  }

  if (!sourceActor) {
    const controlled = canvas.tokens?.controlled || [];
    sourceActor =
      controlled.length === 1 ? controlled[0].actor : game.user.character;
  }

  // Get targets
  let tokensToProcess = getTargets();
  if (!tokensToProcess.length && !isFromActorSheet) {
    tokensToProcess = getControlledTokens();
    if (!tokensToProcess.length) {
      ui.notifications.warn('No targets or controlled tokens selected');
      return;
    }
  }

  // Filter out source actor from targets
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
  const { effectId, duration } = link.dataset;
  const parsedDuration = duration ? JSON.parse(duration) : null;

  // Only handle right-click for stackable effects
  const stackableData = _getStackableEffectData(effectId);
  if (!stackableData?.isStackable) return;

  // Get source actor with fallback chain
  let sourceActor = getSourceActor(link);

  if (!sourceActor) {
    // Try to get from chat message speaker
    const messageElement = link.closest('.chat-message');
    if (messageElement) {
      const messageId = messageElement.dataset.messageId;
      const message = game.messages.get(messageId);
      if (message?.speaker) {
        if (message.speaker.token) {
          const token = canvas.tokens?.get(message.speaker.token);
          sourceActor = token?.actor;
        }
        if (!sourceActor && message.speaker.actor) {
          sourceActor = game.actors.get(message.speaker.actor);
        }
      }
    }

    if (!sourceActor) {
      const controlled = canvas.tokens?.controlled || [];
      if (controlled.length === 1) {
        sourceActor = controlled[0].actor;
      } else if (game.user.character) {
        sourceActor = game.user.character;
      }
    }
  }

  const origin = sourceActor?.uuid || null;

  let tokensToProcess = getTargets();
  if (!tokensToProcess.length) {
    tokensToProcess = getControlledTokens();
    if (!tokensToProcess.length) {
      ui.notifications.warn('No targets or controlled tokens selected');
      return;
    }
  }

  for (const token of tokensToProcess) {
    await _applyEffect(
      token.actor,
      effectId,
      'toggle',
      parsedDuration,
      true,
      origin
    );
  }

  const name = _getEffectName(effectId);
  _showEffectNotification(name, 'stack removed from', tokensToProcess.length);
}

/**
 * Effect enricher function
 *
 * @param {RegExpMatchArray} match - Regex match
 * @param {Object} options - Enrichment options
 * @returns {Promise<HTMLElement|null>} Enriched element or null
 */
async function enrichEffectMatch(match, options) {
  const effectInstances = _parseEffectEnricher(match);
  if (!effectInstances) return null;

  if (effectInstances.length === 1) {
    return _createEffectLink(effectInstances[0]);
  }

  const links = effectInstances.map((effectData) =>
    _createEffectLink(effectData)
  );
  return createEnricherContainer('dasu-effect-enricher', links);
}

/**
 * Register the effect enricher
 * Exported function for system initialization
 */
export const registerEffectEnricher = createEnricherInitializer({
  name: 'Effect',
  pattern: /\[\[\/effect\s+([^\]]+)\]\]/gi,
  enricher: wrapEnricher(enrichEffectMatch, 'effect'),
  selector: '.effect-link',
  clickHandler: _onEffectLinkClick,
  contextMenuHandler: _onEffectLinkContextMenu,
});
