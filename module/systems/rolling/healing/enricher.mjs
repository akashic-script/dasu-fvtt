/**
 * @fileoverview Healing Text Enricher
 *
 * Implements inline healing enrichers for the DASU system, allowing embedding of healing
 * calculations directly into text fields.
 *
 * Syntax:
 * [[/heal formula [resource]]]
 * [[/healing formula [resource]]]
 * [[/heal formula resource & formula resource]] - Multiple instances
 * [[/heal prompt]] - Opens dialog to customize healing before applying
 *
 * Modifier Keys:
 * - Left-click: Apply immediately
 * - Ctrl+Click: Open dialog with prepopulated fields
 *
 * @example
 * [[/heal 2d6]] - Roll 2d6 healing (defaults to HP)
 * [[/heal 1d8 hp]] - Roll 1d8 to restore HP
 * [[/heal 2d4 wp]] - Roll 2d4 to restore WP
 * [[/heal @will wp]] - Restore WP equal to Willpower tick (current actor)
 * [[/heal @origin.pow hp]] - Restore HP equal to origin's POW tick
 * [[/heal @target.will wp]] - Restore WP equal to target's WILL tick
 * [[/heal 2d6 both]] - Roll 2d6 to restore both HP and WP
 * [[/heal 1d6 hp & 1d4 wp]] - Multiple healing instances
 * [[/heal prompt]] - Opens dialog to customize healing before applying
 *
 * Healing Formula:
 * Final Healing = Base Healing + Governing Attribute Tick
 * Critical healing doubles the final amount.
 */
/* global canvas, CONST */
import { HealingEditDialog } from '../../../ui/dialogs/healing-edit-dialog.mjs';
import {
  getSourceActor,
  parseMultipleInstances,
  extractCustomLabel,
  createEnricherLink,
  createEnricherContainer,
  createEnricherInitializer,
  tokenizeEnricherContent,
  validateEnricherValue,
  getTargets,
  wrapEnricher,
  createEnricherChatMessage,
} from '../../enrichers/enricher-base.mjs';

/**
 * Valid resource targets for healing
 */
const RESOURCE_TARGETS = ['hp', 'wp', 'both'];

/**
 * Parse stack references in a formula and replace with actual counts
 * Syntax: stacks:stack-id or @stacks:stack-id
 *
 * @param {string} formula - The healing formula
 * @param {Actor} source - The source actor
 * @param {Actor} target - The target actor
 * @returns {string} Formula with stack references replaced
 * @private
 */
function _parseStackModifiers(formula, source, target) {
  if (!formula) return formula;

  const stackPattern = /@?stacks:([a-z0-9-_]+)/gi;

  return formula.replace(stackPattern, (match, stackId) => {
    // Check source actor for stacks (for buffs on healer)
    let stackCount = source?.getEffectStackCount?.(stackId) || 0;

    // Check target actor for stacks (for debuffs on heal recipient)
    if (stackCount === 0 && target) {
      stackCount = target?.getEffectStackCount?.(stackId) || 0;
    }

    return stackCount.toString();
  });
}

/**
 * Parse attribute references in a formula and replace with actual values
 * Syntax: @origin.attribute or @target.attribute (where attribute is pow, dex, will, sta)
 * Also supports full path: @origin.system.attributes.pow.tick
 *
 * @param {string} formula - The healing formula
 * @param {Actor} source - The source actor (origin)
 * @param {Actor} target - The target actor
 * @returns {string} Formula with attribute references replaced
 * @private
 */
function _parseAttributeReferences(formula, source, target) {
  if (!formula || !formula.includes('@')) return formula;

  // Get roll data from both actors
  const sourceRollData = source?.getRollData() ?? {};
  const targetRollData = target?.getRollData() ?? {};

  const rollData = {
    ...sourceRollData,
    target: targetRollData,
    origin: sourceRollData,
  };

  // Use Roll.replaceFormulaData with {warn: false} to prevent console warnings
  // and wrap replaced values in parentheses to ensure proper arithmetic evaluation
  let result = formula;

  // Match @word patterns (including dots for nested properties)
  const atPattern = /@([a-zA-Z0-9_.]+)/g;
  result = result.replace(atPattern, (match, path) => {
    const value = foundry.utils.getProperty(rollData, path);
    // Return the value wrapped in parentheses to ensure arithmetic works
    return value !== undefined ? `(${value})` : match;
  });

  return result;
}

/**
 * Parse a single healing instance from tokens
 *
 * @param {string} instanceText - Text for this healing instance
 * @returns {Object|null} Parsed healing instance data
 * @private
 */
function _parseHealingInstance(instanceText) {
  const tokens = tokenizeEnricherContent(instanceText);

  if (tokens.length === 0) {
    return null;
  }

  // Check for prompt mode with optional parameters: [[/heal prompt 5 hp]]
  if (tokens[0].toLowerCase() === 'prompt') {
    // If only "prompt", use defaults
    if (tokens.length === 1) {
      return {
        isPrompt: true,
        formula: '0',
        resourceTarget: 'hp',
        isTemp: false,
      };
    }

    // Parse the rest as normal healing parameters
    const formula = tokens[1];
    const resourceTarget = validateEnricherValue(
      tokens[2],
      RESOURCE_TARGETS,
      'hp',
      'Invalid healing resource target:'
    );
    const isTemp = tokens[3] && tokens[3].toLowerCase() === 'temp';

    return {
      isPrompt: true,
      formula,
      resourceTarget,
      isTemp,
    };
  }

  const formula = tokens[0];
  const resourceTarget = validateEnricherValue(
    tokens[1],
    RESOURCE_TARGETS,
    'hp',
    'Invalid healing resource target:'
  );

  // Check for 'temp' flag in third token
  const isTemp = tokens[2] && tokens[2].toLowerCase() === 'temp';

  return {
    formula,
    resourceTarget,
    isTemp,
  };
}

/**
 * Parse healing enricher text
 *
 * @param {RegExpMatchArray} match - The regex match result
 * @returns {Object|null} Parsed healing data or null if invalid
 * @private
 */
function _parseHealingEnricher(match) {
  const fullMatch = match[0];
  const content = match[1].trim();
  const customLabel = extractCustomLabel(match[2]);

  // Split by & for multiple healing instances
  const instanceTexts = parseMultipleInstances(content);

  const healingInstances = instanceTexts
    .map((text) => _parseHealingInstance(text))
    .filter((instance) => instance !== null);

  if (healingInstances.length === 0) {
    console.warn('No valid healing instances found in enricher:', fullMatch);
    return null;
  }

  return {
    fullMatch,
    customLabel,
    healingInstances,
  };
}

/**
 * Generate default label for healing instance
 *
 * @param {Object} instance - Healing instance data
 * @returns {string} Generated label
 * @private
 */
function _generateHealingLabel(instance) {
  const { formula, resourceTarget, isTemp } = instance;

  const tempPrefix = isTemp ? 'Temp ' : '';

  if (resourceTarget === 'both') {
    return `${formula} ${tempPrefix}HP & WP`;
  }

  return `${formula} ${tempPrefix}${resourceTarget.toUpperCase()}`;
}

/**
 * Create healing enricher link for a single instance
 *
 * @param {Object} instance - Healing instance data
 * @param {string|null} customLabel - Optional custom label
 * @returns {HTMLElement} Healing link element
 * @private
 */
function _createHealingInstanceLink(instance, customLabel, sourceActorUuid) {
  const { formula, resourceTarget, isTemp, isPrompt } = instance;

  // Handle prompt mode
  if (isPrompt) {
    return createEnricherLink({
      cssClass: 'dasu-healing-link healing-prompt',
      iconClass: 'fa-edit',
      labelText:
        customLabel ||
        (formula !== '0'
          ? `Healing: ${formula} ${resourceTarget.toUpperCase()}`
          : 'Healing'),
      tooltip: 'Open dialog to customize healing before applying',
      dataset: {
        formula: formula || '0',
        resourceTarget: resourceTarget || 'hp',
        isTemp: isTemp ? 'true' : 'false',
        isPrompt: 'true',
        sourceActorUuid: sourceActorUuid || '',
      },
    });
  }

  const labelText = customLabel || _generateHealingLabel(instance);
  const healType = isTemp ? 'Grant temporary' : 'Heal';
  const tooltip = `${healType} ${formula} ${resourceTarget.toUpperCase()}`;

  const dataset = {
    formula,
    resourceTarget,
    isTemp: isTemp ? 'true' : 'false',
  };

  // Store source actor UUID if available
  if (sourceActorUuid) {
    dataset.sourceActorUuid = sourceActorUuid;
  }

  return createEnricherLink({
    cssClass: isTemp ? 'dasu-healing-link temp-hp' : 'dasu-healing-link',
    iconClass: isTemp ? 'fa-shield-alt' : 'fa-heart',
    labelText,
    tooltip,
    dataset,
  });
}

/**
 * Create complete healing enricher element
 *
 * @param {Object} healingData - Parsed healing data
 * @param {string|null} sourceActorUuid - UUID of the source actor
 * @returns {HTMLElement} Container with all healing links
 * @private
 */
function _createHealingLinks(healingData, sourceActorUuid) {
  const { customLabel, healingInstances } = healingData;

  const links = healingInstances.map((instance) =>
    _createHealingInstanceLink(instance, customLabel, sourceActorUuid)
  );

  return createEnricherContainer('dasu-healing-enricher', links);
}

/**
 * Apply quick healing without full targeting workflow
 *
 * @param {Actor} targetActor - Actor receiving healing
 * @param {number} baseAmount - Base healing amount
 * @param {string} resourceTarget - Resource to heal (hp, wp, both)
 * @param {Roll} roll - The healing roll
 * @param {Actor} sourceActor - Actor providing healing (for attribute bonus)
 * @param {string} [tokenId] - Token ID for unlinked tokens
 * @returns {Promise<void>}
 * @private
 */
async function _applyQuickHealing(
  targetActor,
  baseAmount,
  resourceTarget,
  roll,
  sourceActor,
  tokenId = null
) {
  const attributeTick = 0; // No governing attribute for enricher
  const finalHealing = baseAmount;

  // Apply healing to actor
  const result = await targetActor.applyHealing(finalHealing, resourceTarget, {
    suppressChat: true,
  });

  // Build flavor text with dice results for chat message
  const diceResults = roll.dice
    .map((d) => d.results.map((r) => r.result).join(', '))
    .join('; ');
  const flavorText = `<span class="flavor-text">healing applied (${roll.formula}: ${diceResults} = ${baseAmount})</span>`;

  // Build chat message content
  const icon = '<i class="fas fa-heart"></i>';
  const healingText = result.applied > 0 ? 'recovered' : 'attempted to recover';
  const targetAttrs = `data-actor-id="${targetActor.id}"${
    tokenId ? ` data-token-id="${tokenId}"` : ''
  }`;

  const content = `
    <div class='dasu healing-applied success'>
      <div class='healing-applied-content'>
        <div class='healing-text'>
          <span class='healing-icon'>${icon}</span>
          <strong class="target-name clickable" ${targetAttrs}>${
    targetActor.name
  }</strong> ${healingText}
          ${
            result.applied > 0
              ? ` <strong class='healing-amount'>${
                  result.applied
                }</strong> ${resourceTarget.toUpperCase()}`
              : ''
          }
        </div>
        <div class='healing-actions-small'>
          <button class='healing-action-btn undo' data-action='undoHealing' data-target-id='${
            targetActor.id
          }' data-amount='${
    result.applied
  }' data-resource='${resourceTarget}' data-is-healing='true'>
            <i class='fas fa-undo'></i>Undo
          </button>
        </div>
      </div>
    </div>
  `;

  // Create chat message
  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    flavor: flavorText,
    flags: {
      dasu: {
        healingApplication: {
          targetId: targetActor.id,
          targetName: targetActor.name,
          appliedHealing: result.applied,
          healingType: resourceTarget,
          baseHealing: baseAmount,
          attributeBonus: attributeTick,
          finalHealing,
        },
        enricherHealing: true,
      },
    },
  });
}

/**
 * Apply temporary HP to actor
 *
 * @param {Actor} targetActor - Actor receiving temp HP
 * @param {number} amount - Amount of temp HP to grant
 * @param {string} resourceTarget - Resource target (hp, wp, both)
 * @param {Roll} roll - The roll that determined the amount
 * @param {Actor} sourceActor - Actor granting temp HP
 * @param {string} [tokenId] - Token ID for unlinked tokens
 * @returns {Promise<void>}
 * @private
 */
async function _applyTempHP(
  targetActor,
  amount,
  resourceTarget,
  roll,
  sourceActor,
  tokenId = null
) {
  // Build flavor text with dice results for chat message
  const diceResults = roll.dice
    .map((d) => d.results.map((r) => r.result).join(', '))
    .join('; ');
  const flavorText = `<span class="flavor-text">temporary HP granted (${roll.formula}: ${diceResults} = ${amount})</span>`;

  // Apply temp HP to target
  if (resourceTarget === 'both') {
    await targetActor.addTempHP(amount, 'hp');
    await targetActor.addTempHP(amount, 'wp');
  } else {
    await targetActor.addTempHP(amount, resourceTarget);
  }

  // Build chat message content
  const icon = '<i class="fas fa-shield-alt"></i>';
  const targetAttrs = `data-actor-id="${targetActor.id}"${
    tokenId ? ` data-token-id="${tokenId}"` : ''
  }`;

  const content = `
    <div class='dasu healing-applied temp-hp'>
      <div class='healing-applied-content'>
        <div class='healing-text'>
          <span class='healing-icon'>${icon}</span>
          <strong class="target-name clickable" ${targetAttrs}>${
    targetActor.name
  }</strong> gains
          <strong class='healing-amount'>${amount}</strong> temporary ${resourceTarget.toUpperCase()}
        </div>
      </div>
    </div>
  `;

  // Create chat message
  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    flavor: flavorText,
    flags: {
      dasu: {
        tempHPGrant: {
          targetId: targetActor.id,
          targetName: targetActor.name,
          amount,
          resourceTarget,
        },
        enricherHealing: true,
      },
    },
  });
}

/**
 * Open healing edit dialog for customizing healing before applying
 *
 * @param {Actor} sourceActor - Source actor
 * @param {string} formula - Healing formula
 * @param {string} resourceTarget - Resource target (hp, wp, both)
 * @param {HTMLElement} link - The enricher link element
 * @private
 */
async function _openHealingDialog(sourceActor, formula, resourceTarget, link) {
  // Get targets
  const targets = getTargets();
  let healTargets = targets;

  // If no targets, apply to self
  if (healTargets.length === 0) {
    const selfToken = sourceActor.getActiveTokens()[0];
    healTargets = selfToken
      ? [selfToken]
      : [{ actor: sourceActor, id: 'actor-only' }];
  }

  // Parse and evaluate formula for each target
  for (const target of healTargets) {
    const targetActor = target.actor;
    if (!targetActor) continue;

    // Parse attribute references and stacks
    let parsedFormula = _parseAttributeReferences(
      formula,
      sourceActor,
      targetActor
    );
    parsedFormula = _parseStackModifiers(
      parsedFormula,
      sourceActor,
      targetActor
    );

    // Evaluate the formula
    const rollData = sourceActor.getRollData();
    const roll = new Roll(parsedFormula, rollData);
    await roll.evaluate();

    const baseHealing = roll.total;

    // Get token ID for unlinked tokens
    const tokenId = target.id !== 'actor-only' ? target.id : null;

    // Open dialog for this target
    await HealingEditDialog.create({
      targetActor,
      tokenId,
      sourceActor,
      sourceItem: null,
      originalHealing: baseHealing,
      originalResourceTarget: resourceTarget,
      govern: null,
      healMod: 0,
      healType: resourceTarget,
    });
  }
}

/**
 * Handle healing link clicks
 *
 * @param {Event} event - Click event
 * @private
 */
async function _onHealingLinkClick(event) {
  event.preventDefault();

  const link = event.currentTarget;
  const formula = link.dataset.formula;
  const resourceTarget = link.dataset.resourceTarget;
  const isTemp = link.dataset.isTemp === 'true';
  const sourceActorUuid = link.dataset.sourceActorUuid;
  const isPrompt = link.dataset.isPrompt === 'true';

  // Try to get source actor from stored UUID first
  let sourceActor = sourceActorUuid ? await fromUuid(sourceActorUuid) : null;

  // If we got a synthetic token actor, get the base actor
  if (sourceActor?.isToken) {
    sourceActor = game.actors.get(sourceActor.id) || sourceActor;
  }

  // Fallback to context-based lookup
  if (!sourceActor) {
    sourceActor = getSourceActor(link);
  }

  if (!sourceActor) {
    ui.notifications.warn(
      'No source actor found for healing. Select a token to set the source actor, then target tokens to apply healing.'
    );
    return;
  }

  // Check for prompt mode or Ctrl+Click to open dialog (not for temp HP)
  if ((isPrompt || event.ctrlKey || event.metaKey) && !isTemp) {
    await _openHealingDialog(sourceActor, formula, resourceTarget, link);
    return;
  }

  try {
    // Get targets first (needed for stack parsing)
    const targets = getTargets();
    let healTargets = targets;

    if (healTargets.length === 0) {
      // Apply to self if no targets
      const selfTokens = sourceActor.isToken
        ? [sourceActor.token?.object].filter(Boolean)
        : sourceActor.getActiveTokens?.() || [];

      healTargets =
        selfTokens.length > 0
          ? selfTokens
          : [{ actor: sourceActor, id: 'actor-only' }];
    }

    // Get primary target for attribute and stack parsing
    const primaryTarget = healTargets[0]?.actor || sourceActor;

    // Parse attribute references (@origin.pow, @target.dex, etc.)
    let parsedFormula = _parseAttributeReferences(
      formula,
      sourceActor,
      primaryTarget
    );

    // Parse stack references in formula
    parsedFormula = _parseStackModifiers(
      parsedFormula,
      sourceActor,
      primaryTarget
    );

    // Evaluate the formula with roll data
    const rollData = sourceActor.getRollData();
    const roll = new Roll(parsedFormula, rollData);
    await roll.evaluate();

    const baseHealing = roll.total;

    // Apply healing or temp HP to all targets
    for (const target of healTargets) {
      const targetActor = target.actor;
      if (!targetActor) continue;

      // Get token ID for unlinked tokens
      const tokenId = target.id !== 'actor-only' ? target.id : null;

      if (isTemp) {
        await _applyTempHP(
          targetActor,
          baseHealing,
          resourceTarget,
          roll,
          sourceActor,
          tokenId
        );
      } else {
        await _applyQuickHealing(
          targetActor,
          baseHealing,
          resourceTarget,
          roll,
          sourceActor,
          tokenId
        );
      }
    }
  } catch (error) {
    ui.notifications.error(`Failed to process healing: ${error.message}`);
    console.error('Healing enricher error:', error);
  }
}

/**
 * Healing enricher function
 *
 * @param {RegExpMatchArray} match - Regex match
 * @param {Object} options - Enrichment options
 * @returns {Promise<HTMLElement|null>} Enriched element or null
 */
async function enrichHealingMatch(match, options) {
  const healingData = _parseHealingEnricher(match);
  if (!healingData) return null;

  // Store the relativeTo document UUID for later retrieval
  const sourceActor = options?.relativeTo;
  const sourceActorUuid = sourceActor?.uuid;

  return _createHealingLinks(healingData, sourceActorUuid);
}

/**
 * Initialize healing enricher
 * Registers the enricher and sets up event handlers
 */
export const initializeHealingEnricher = createEnricherInitializer({
  name: 'Healing',
  pattern: /\[\[\/heal(?:ing)?\s+([^\]]+?)\]\](?:\{([^}]+)\})?/gi,
  enricher: wrapEnricher(enrichHealingMatch, 'healing'),
  selector: '.dasu-healing-link',
  clickHandler: _onHealingLinkClick,
});
