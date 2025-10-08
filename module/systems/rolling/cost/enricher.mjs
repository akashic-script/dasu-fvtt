/**
 * @fileoverview Cost Text Enricher
 *
 * Implements inline cost enrichers for the DASU system, allowing embedding of resource
 * costs directly into text fields. Costs apply negative healing (resource reduction)
 * without any attribute bonuses or resistance calculations.
 *
 * Syntax:
 * [[/cost formula [resource]]]
 * [[/cost formula resource & formula resource]] - Multiple instances
 * [[/cost prompt]] - Opens dialog to customize cost before applying
 *
 * Modifier Keys:
 * - Left-click: Apply immediately
 * - Ctrl+Click: Open dialog with prepopulated fields
 *
 * @example
 * [[/cost 2 wp]] - Reduce WP by 2
 * [[/cost 1d4 hp]] - Roll 1d4 HP cost
 * [[/cost 3 both]] - Reduce both HP and WP by 3
 * [[/cost @will wp]] - Reduce WP by Willpower tick value
 * [[/cost 2 hp & 1 wp]] - Multiple cost instances
 * [[/cost prompt]] - Opens dialog to customize cost before applying
 *
 * Cost Formula:
 * Costs are applied as negative values directly to resources.
 * No attribute bonuses or resistance calculations are applied.
 */
/* global CONST */
import { CostEditDialog } from '../../../ui/dialogs/cost-edit-dialog.mjs';
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
} from '../../enrichers/enricher-base.mjs';

/**
 * Valid resource targets for costs
 */
const RESOURCE_TARGETS = ['hp', 'wp', 'both'];

/**
 * Parse stack references in a formula and replace with actual counts
 * Syntax: @stacks:stack-id
 *
 * @param {string} formula - The cost formula
 * @param {Actor} source - The source actor
 * @param {Actor} target - The target actor
 * @returns {string} Formula with stack references replaced
 * @private
 */
function _parseStackModifiers(formula, source, target) {
  if (!formula) return formula;

  const stackPattern = /@stacks:([a-z0-9-_]+)/gi;

  return formula.replace(stackPattern, (match, stackId) => {
    // Check source actor for stacks
    let stackCount = source?.getEffectStackCount?.(stackId) || 0;

    // Check target actor for stacks
    if (stackCount === 0 && target) {
      stackCount = target?.getEffectStackCount?.(stackId) || 0;
    }

    return stackCount.toString();
  });
}

/**
 * Parse attribute references in a formula and replace with actual values
 * Syntax: @origin.attribute or @target.attribute (where attribute is pow, dex, will, sta)
 *
 * @param {string} formula - The cost formula
 * @param {Actor} source - The source actor (origin)
 * @param {Actor} target - The target actor
 * @returns {string} Formula with attribute references replaced
 * @private
 */
function _parseAttributeReferences(formula, source, target) {
  if (!formula) return formula;

  // Pattern for attribute shortcuts: @origin.pow or @target.pow
  const shortPattern = /@(origin|target)\.(pow|dex|will|sta)/gi;

  // Pattern for full paths: @origin.system.attributes.pow.tick
  const fullPattern =
    /@(origin|target)\.system\.attributes\.(pow|dex|will|sta)\.tick/gi;

  let result = formula;

  // Replace full paths first
  result = result.replace(fullPattern, (match, actorRef, attr) => {
    const actor = actorRef === 'origin' ? source : target;
    const value = actor?.system?.attributes?.[attr]?.tick ?? 0;
    return value.toString();
  });

  // Replace shortcuts
  result = result.replace(shortPattern, (match, actorRef, attr) => {
    const actor = actorRef === 'origin' ? source : target;
    const value = actor?.system?.attributes?.[attr]?.tick ?? 0;
    return value.toString();
  });

  return result;
}

/**
 * Parse a single cost instance from tokens
 *
 * @param {string} instanceText - Text for this cost instance
 * @returns {Object|null} Parsed cost instance data
 * @private
 */
function _parseCostInstance(instanceText) {
  const tokens = tokenizeEnricherContent(instanceText);

  if (tokens.length === 0) {
    return null;
  }

  // Check for prompt mode with optional parameters: [[/cost prompt 5 wp]]
  if (tokens[0].toLowerCase() === 'prompt') {
    // If only "prompt", use defaults
    if (tokens.length === 1) {
      return {
        isPrompt: true,
        formula: '0',
        resourceTarget: 'wp',
      };
    }

    // Parse the rest as normal cost parameters
    const formula = tokens[1];
    const resourceTarget = validateEnricherValue(
      tokens[2],
      RESOURCE_TARGETS,
      'wp',
      'Invalid cost resource target:'
    );

    return {
      isPrompt: true,
      formula,
      resourceTarget,
    };
  }

  const formula = tokens[0];
  const resourceTarget = validateEnricherValue(
    tokens[1],
    RESOURCE_TARGETS,
    'wp',
    'Invalid cost resource target:'
  );

  return {
    formula,
    resourceTarget,
  };
}

/**
 * Parse cost enricher text
 *
 * @param {RegExpMatchArray} match - The regex match result
 * @returns {Object|null} Parsed cost data or null if invalid
 * @private
 */
function _parseCostEnricher(match) {
  const fullMatch = match[0];
  const content = match[1].trim();
  const customLabel = extractCustomLabel(match[2]);

  // Split by & for multiple cost instances
  const instanceTexts = parseMultipleInstances(content);

  const costInstances = instanceTexts
    .map((text) => _parseCostInstance(text))
    .filter((instance) => instance !== null);

  if (costInstances.length === 0) {
    console.warn('No valid cost instances found in enricher:', fullMatch);
    return null;
  }

  return {
    fullMatch,
    customLabel,
    costInstances,
  };
}

/**
 * Generate default label for cost instance
 *
 * @param {Object} instance - Cost instance data
 * @returns {string} Generated label
 * @private
 */
function _generateCostLabel(instance) {
  const { formula, resourceTarget } = instance;

  if (resourceTarget === 'both') {
    return `${formula} HP & WP`;
  }

  return `${formula} ${resourceTarget.toUpperCase()}`;
}

/**
 * Create cost enricher link for a single instance
 *
 * @param {Object} instance - Cost instance data
 * @param {string|null} customLabel - Optional custom label
 * @param {string|null} sourceActorUuid - UUID of the source actor
 * @returns {HTMLElement} Cost link element
 * @private
 */
function _createCostInstanceLink(instance, customLabel, sourceActorUuid) {
  const { formula, resourceTarget, isPrompt } = instance;

  // Handle prompt mode
  if (isPrompt) {
    return createEnricherLink({
      cssClass: 'dasu-cost-link cost-prompt',
      iconClass: 'fa-edit',
      labelText:
        customLabel ||
        (formula !== '0'
          ? `Cost: ${formula} ${resourceTarget.toUpperCase()}`
          : 'Cost'),
      tooltip: 'Open dialog to customize cost before applying',
      dataset: {
        formula: formula || '0',
        resourceTarget: resourceTarget || 'wp',
        isPrompt: 'true',
        sourceActorUuid: sourceActorUuid || '',
      },
    });
  }

  const labelText = customLabel || _generateCostLabel(instance);
  const tooltip = `Pay ${formula} ${resourceTarget.toUpperCase()} cost`;

  const dataset = {
    formula,
    resourceTarget,
  };

  // Store source actor UUID if available
  if (sourceActorUuid) {
    dataset.sourceActorUuid = sourceActorUuid;
  }

  return createEnricherLink({
    cssClass: 'dasu-cost-link',
    iconClass: 'fa-coins',
    labelText,
    tooltip,
    dataset,
  });
}

/**
 * Create complete cost enricher element
 *
 * @param {Object} costData - Parsed cost data
 * @param {string|null} sourceActorUuid - UUID of the source actor
 * @returns {HTMLElement} Container with all cost links
 * @private
 */
function _createCostLinks(costData, sourceActorUuid) {
  const { customLabel, costInstances } = costData;

  const links = costInstances.map((instance) =>
    _createCostInstanceLink(instance, customLabel, sourceActorUuid)
  );

  return createEnricherContainer('dasu-cost-enricher', links);
}

/**
 * Apply cost (negative healing) to actor
 *
 * @param {Actor} targetActor - Actor paying the cost
 * @param {number} amount - Cost amount
 * @param {string} resourceTarget - Resource to reduce (hp, wp, both)
 * @param {Roll} roll - The cost roll
 * @param {Actor} sourceActor - Actor initiating the cost
 * @param {string} [tokenId] - Token ID for unlinked tokens
 * @returns {Promise<void>}
 * @private
 */
async function _applyCost(
  targetActor,
  amount,
  resourceTarget,
  roll,
  sourceActor,
  tokenId = null
) {
  // Apply cost directly by reducing resources (applyHealing doesn't accept negative values)
  const currentHp =
    targetActor.system.stats?.hp?.current ??
    targetActor.system.hp?.current ??
    0;
  const currentWp =
    targetActor.system.stats?.wp?.current ??
    targetActor.system.wp?.current ??
    0;

  const updates = {};
  let appliedCost = 0;

  if (resourceTarget === 'hp' || resourceTarget === 'both') {
    const newHp = Math.max(0, currentHp - amount);
    appliedCost += currentHp - newHp;
    if (targetActor.system.stats?.hp?.current !== undefined) {
      updates['system.stats.hp.current'] = newHp;
    } else {
      updates['system.hp.current'] = newHp;
    }
  }

  if (resourceTarget === 'wp' || resourceTarget === 'both') {
    const newWp = Math.max(0, currentWp - amount);
    appliedCost += currentWp - newWp;
    if (targetActor.system.stats?.wp?.current !== undefined) {
      updates['system.stats.wp.current'] = newWp;
    } else {
      updates['system.wp.current'] = newWp;
    }
  }

  if (Object.keys(updates).length > 0) {
    await targetActor.update(updates);
  }

  const result = {
    applied: appliedCost,
    resourceTarget,
    actor: targetActor,
    updates,
  };

  // Build flavor text with dice results for chat message
  const diceResults = roll.dice
    .map((d) => d.results.map((r) => r.result).join(', '))
    .join('; ');
  const flavorText = `<span class="flavor-text">cost paid (${roll.formula}: ${diceResults} = ${amount})</span>`;

  // Build chat message content
  const icon = '<i class="fas fa-coins"></i>';
  const targetAttrs = `data-actor-id="${targetActor.id}"${
    tokenId ? ` data-token-id="${tokenId}"` : ''
  }`;

  const actualCost = Math.abs(result.applied);
  const costText = actualCost > 0 ? 'paid' : 'attempted to pay';

  const content = `
    <div class='dasu cost-applied'>
      <div class='cost-applied-content'>
        <div class='cost-text'>
          <span class='cost-icon'>${icon}</span>
          <strong class="target-name clickable" ${targetAttrs}>${
    targetActor.name
  }</strong> ${costText}
          ${
            actualCost > 0
              ? ` <strong class='cost-amount'>${actualCost}</strong> ${resourceTarget.toUpperCase()}`
              : ''
          }
        </div>
        <div class='cost-actions-small'>
          <button class='cost-action-btn undo' data-action='undoCost' data-target-id='${
            targetActor.id
          }' data-amount='${actualCost}' data-resource='${resourceTarget}'>
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
        costApplication: {
          targetId: targetActor.id,
          targetName: targetActor.name,
          appliedCost: actualCost,
          costType: resourceTarget,
          baseCost: amount,
        },
        enricherCost: true,
      },
    },
  });
}

/**
 * Open cost edit dialog for customizing cost before applying
 *
 * @param {Actor} sourceActor - Source actor
 * @param {string} formula - Cost formula
 * @param {string} resourceTarget - Resource target (hp, wp, both)
 * @param {HTMLElement} link - The enricher link element
 * @private
 */
async function _openCostDialog(sourceActor, formula, resourceTarget, link) {
  // Get targets
  const targets = getTargets();
  let costTargets = targets;

  // If no targets, apply to self
  if (costTargets.length === 0) {
    const selfToken = sourceActor.getActiveTokens()[0];
    costTargets = selfToken
      ? [selfToken]
      : [{ actor: sourceActor, id: 'actor-only' }];
  }

  // Parse and evaluate formula for each target
  for (const target of costTargets) {
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

    const baseCost = roll.total;

    // Get token ID for unlinked tokens
    const tokenId = target.id !== 'actor-only' ? target.id : null;

    // Open cost dialog
    await CostEditDialog.create({
      targetActor,
      tokenId,
      sourceActor,
      sourceItem: null,
      originalCost: baseCost,
      originalResourceTarget: resourceTarget,
      costMod: 0,
      costType: resourceTarget,
    });
  }
}

/**
 * Handle cost link clicks
 *
 * @param {Event} event - Click event
 * @private
 */
async function _onCostLinkClick(event) {
  event.preventDefault();

  const link = event.currentTarget;
  const formula = link.dataset.formula;
  const resourceTarget = link.dataset.resourceTarget;
  const sourceActorUuid = link.dataset.sourceActorUuid;
  const isPrompt = link.dataset.isPrompt === 'true';

  // Try to get source actor from stored UUID first
  let sourceActor = sourceActorUuid ? await fromUuid(sourceActorUuid) : null;

  // Ensure we have the actor, not a token document
  if (sourceActor?.actor) {
    sourceActor = sourceActor.actor;
  }

  // Fallback to context-based lookup
  if (!sourceActor) {
    sourceActor = getSourceActor(link);
  }

  if (!sourceActor) {
    ui.notifications.warn(
      'No source actor found for cost. Select a token to set the source actor.'
    );
    return;
  }

  // For prompt mode or Ctrl+click, open dialog
  if (isPrompt || event.ctrlKey || event.metaKey) {
    await _openCostDialog(sourceActor, formula, resourceTarget, link);
    return;
  }

  try {
    // Get targets first (needed for stack parsing)
    const targets = getTargets();
    let costTargets = targets;

    if (costTargets.length === 0) {
      // Apply to self if no targets
      const selfToken = sourceActor.getActiveTokens()[0];
      costTargets = selfToken
        ? [selfToken]
        : [{ actor: sourceActor, id: 'actor-only' }];
    }

    // Get primary target for attribute and stack parsing
    const primaryTarget = costTargets[0]?.actor || sourceActor;

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

    const baseCost = roll.total;

    // Apply cost to all targets
    for (const target of costTargets) {
      const targetActor = target.actor;
      if (!targetActor) continue;

      // Get token ID for unlinked tokens
      const tokenId = target.id !== 'actor-only' ? target.id : null;

      await _applyCost(
        targetActor,
        baseCost,
        resourceTarget,
        roll,
        sourceActor,
        tokenId
      );
    }
  } catch (error) {
    ui.notifications.error(`Failed to process cost: ${error.message}`);
    console.error('Cost enricher error:', error);
  }
}

/**
 * Cost enricher function
 *
 * @param {RegExpMatchArray} match - Regex match
 * @param {Object} options - Enrichment options
 * @returns {Promise<HTMLElement|null>} Enriched element or null
 */
async function enrichCostMatch(match, options) {
  const costData = _parseCostEnricher(match);
  if (!costData) return null;

  // Store the relativeTo document UUID for later retrieval
  const sourceActor = options?.relativeTo;
  const sourceActorUuid = sourceActor?.uuid;

  return _createCostLinks(costData, sourceActorUuid);
}

/**
 * Initialize cost enricher
 * Registers the enricher and sets up event handlers
 */
export const initializeCostEnricher = createEnricherInitializer({
  name: 'Cost',
  pattern: /\[\[\/cost\s+([^\]]+?)\]\](?:\{([^}]+)\})?/gi,
  enricher: wrapEnricher(enrichCostMatch, 'cost'),
  selector: '.dasu-cost-link',
  clickHandler: _onCostLinkClick,
});
