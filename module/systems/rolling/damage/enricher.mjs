/**
 * @fileoverview Damage Text Enricher
 *
 * Implements inline damage enrichers for the DASU system, allowing embedding of damage
 * calculations directly into text fields.
 *
 * Syntax:
 * [[/damage formula [type] [resource]]]
 * [[/damage formula type resource & formula type resource]] - Multiple instances
 * [[/damage prompt]] - Opens dialog to customize damage before applying
 *
 * Modifier Keys:
 * - Left-click: Apply immediately
 * - Ctrl+Click: Open dialog with prepopulated fields
 *
 * @example
 * [[/damage 2d6]] - Roll 2d6 damage (defaults to physical, HP)
 * [[/damage 1d8 fire]] - Roll 1d8 fire damage to HP
 * [[/damage 2d4 dark wp]] - Roll 2d4 dark damage to WP
 * [[/damage @pow light]] - Deal light damage equal to Power tick (current actor)
 * [[/damage @origin.pow fire]] - Deal fire damage equal to origin's POW tick
 * [[/damage @target.dex ice]] - Deal ice damage equal to target's DEX tick
 * [[/damage 2d6 fire hp]] - Roll 2d6 fire damage explicitly to HP
 * [[/damage 1d6 fire hp & 1d4 dark wp]] - Multiple damage instances
 * [[/damage prompt]] - Opens dialog to customize damage before applying
 *
 * Damage Formula:
 * Base Damage from formula, modified by resistances:
 * - Drain (-1): Heals instead of damages
 * - Nullify (0): No damage dealt
 * - Resist (1): Half damage (×0.5)
 * - Normal (2): Full damage
 * - Weak (3): Double damage (×2)
 * Critical hits bypass resistances.
 */

import { Damage } from './index.mjs';
import { DamageEditDialog } from '../../../ui/dialogs/damage-edit-dialog.mjs';
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
 * Valid damage types for the DASU system
 */
const DAMAGE_TYPES = [
  'physical',
  'fire',
  'ice',
  'electric',
  'wind',
  'earth',
  'light',
  'dark',
  'untyped',
];

/**
 * Valid resource targets
 */
const RESOURCE_TARGETS = ['hp', 'wp', 'both'];

/**
 * Parse stack references in a formula and replace with actual counts
 * Syntax: @stacks:stack-id
 *
 * @param {string} formula - The damage formula
 * @param {Actor} source - The source actor
 * @param {Actor} target - The target actor
 * @returns {string} Formula with stack references replaced
 * @private
 */
function _parseStackModifiers(formula, source, target) {
  if (!formula) return formula;

  const stackPattern = /@stacks:([a-z0-9-_]+)/gi;

  return formula.replace(stackPattern, (match, stackId) => {
    // Check source actor for stacks (for buffs on attacker)
    let stackCount = source?.getEffectStackCount?.(stackId) || 0;

    // Check target actor for stacks (for debuffs on defender)
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
 * @param {string} formula - The damage formula
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
 * Parse a single damage instance from tokens
 *
 * @param {string} instanceText - Text for this damage instance
 * @returns {Object} Parsed damage instance data
 * @private
 */
function _parseDamageInstance(instanceText) {
  const tokens = tokenizeEnricherContent(instanceText);

  if (tokens.length === 0) {
    return null;
  }

  // Check for prompt mode with optional parameters: [[/damage prompt 5 fire]]
  if (tokens[0].toLowerCase() === 'prompt') {
    // If only "prompt", use defaults
    if (tokens.length === 1) {
      return {
        isPrompt: true,
        formula: '0',
        damageType: 'physical',
        resourceTarget: 'hp',
      };
    }

    // Parse the rest as normal damage parameters
    const formula = tokens[1];
    let damageType = 'physical';
    let resourceTarget = 'hp';

    // Check if token 2 is a damage type
    if (tokens[2] && DAMAGE_TYPES.includes(tokens[2].toLowerCase())) {
      damageType = tokens[2].toLowerCase();
      // Check if token 3 is a resource target
      if (tokens[3] && RESOURCE_TARGETS.includes(tokens[3].toLowerCase())) {
        resourceTarget = tokens[3].toLowerCase();
      }
    }
    // Check if token 2 is a resource target
    else if (tokens[2] && RESOURCE_TARGETS.includes(tokens[2].toLowerCase())) {
      resourceTarget = tokens[2].toLowerCase();
    }

    return {
      isPrompt: true,
      formula,
      damageType,
      resourceTarget,
    };
  }

  // Find where the formula ends by looking for damage type or resource keywords
  let formulaEndIndex = 0;
  let damageType = 'physical';
  let resourceTarget = 'hp';

  // Scan tokens to find damage types and resources
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const lowerToken = token.toLowerCase();

    if (DAMAGE_TYPES.includes(lowerToken)) {
      damageType = lowerToken;
      if (formulaEndIndex === 0) formulaEndIndex = i;
    } else if (RESOURCE_TARGETS.includes(lowerToken)) {
      resourceTarget = lowerToken;
      if (formulaEndIndex === 0) formulaEndIndex = i;
    } else if (token.includes('/') || lowerToken === 'prompt') {
      // Multiple damage types (e.g., "fire/ice") or prompt
      damageType = lowerToken;
      if (formulaEndIndex === 0) formulaEndIndex = i;
    }
  }

  // If no damage type or resource found, all tokens are part of the formula
  if (formulaEndIndex === 0) {
    formulaEndIndex = tokens.length;
  }

  // Reconstruct the formula from the tokens before the damage type
  const formula = tokens.slice(0, formulaEndIndex).join(' ');

  return {
    formula,
    damageType,
    resourceTarget,
  };
}

/**
 * Parse damage enricher text
 *
 * @param {RegExpMatchArray} match - The regex match result
 * @returns {Object|null} Parsed damage data or null if invalid
 * @private
 */
function _parseDamageEnricher(match) {
  const fullMatch = match[0];
  const content = match[1].trim();
  const customLabel = extractCustomLabel(match[2]);

  // Split by & for multiple damage instances
  const instanceTexts = parseMultipleInstances(content);

  const damageInstances = instanceTexts
    .map((text) => _parseDamageInstance(text))
    .filter((instance) => instance !== null);

  if (damageInstances.length === 0) {
    console.warn('No valid damage instances found in enricher:', fullMatch);
    return null;
  }

  return {
    fullMatch,
    customLabel,
    damageInstances,
  };
}

/**
 * Generate default label for damage instance
 *
 * @param {Object} instance - Damage instance data
 * @returns {string} Generated label
 * @private
 */
function _generateDamageLabel(instance) {
  const { formula, damageType, resourceTarget } = instance;

  const typeText =
    damageType !== 'physical' && damageType !== 'untyped'
      ? ` ${damageType}`
      : '';
  const resourceText =
    resourceTarget !== 'hp' ? ` (${resourceTarget.toUpperCase()})` : '';

  return `${formula}${typeText}${resourceText}`;
}

/**
 * Map damage type to resistance icon
 *
 * @param {string} damageType - Damage type
 * @returns {string|null} Icon path or null for untyped
 * @private
 */
function _getDamageTypeIcon(damageType) {
  const iconMap = {
    physical: 'systems/dasu/assets/static/resistances/physical.png',
    fire: 'systems/dasu/assets/static/resistances/fire.png',
    ice: 'systems/dasu/assets/static/resistances/ice.png',
    electric: 'systems/dasu/assets/static/resistances/electric.png',
    wind: 'systems/dasu/assets/static/resistances/wind.png',
    earth: 'systems/dasu/assets/static/resistances/earth.png',
    light: 'systems/dasu/assets/static/resistances/light.png',
    dark: 'systems/dasu/assets/static/resistances/dark.png',
  };

  return iconMap[damageType] || null;
}

/**
 * Create damage enricher link for a single instance
 *
 * @param {Object} instance - Damage instance data
 * @param {string|null} customLabel - Optional custom label
 * @param {string|null} sourceActorUuid - UUID of the source actor
 * @param {Actor|null} sourceActor - The source actor (if available during enrichment)
 * @returns {HTMLElement} Damage link element
 * @private
 */
function _createDamageInstanceLink(
  instance,
  customLabel,
  sourceActorUuid,
  sourceActor
) {
  const { formula, damageType, resourceTarget, isPrompt } = instance;

  // Handle prompt mode
  if (isPrompt) {
    return createEnricherLink({
      cssClass: 'dasu-damage-link damage-prompt',
      iconClass: 'fa-edit',
      labelText:
        customLabel ||
        (formula !== '0' ? `Damage: ${formula} ${damageType}` : 'Damage'),
      tooltip: 'Open dialog to customize damage before applying',
      dataset: {
        formula: formula || '0',
        damageType: damageType || 'physical',
        resourceTarget: resourceTarget || 'hp',
        isPrompt: 'true',
        sourceActorUuid: sourceActorUuid || '',
      },
    });
  }

  let displayFormula = formula;
  let labelText = customLabel || _generateDamageLabel(instance);

  // If we have the source actor, try to pre-calculate the formula
  if (sourceActor && !customLabel) {
    try {
      // Parse the formula with source actor data
      let parsedFormula = _parseAttributeReferences(formula, sourceActor, null);
      parsedFormula = _parseStackModifiers(parsedFormula, sourceActor, null);

      // Try to evaluate if it's a simple formula (no dice rolls)
      if (!parsedFormula.includes('d')) {
        const rollData = sourceActor.getRollData();
        const roll = new Roll(parsedFormula, rollData);
        roll.evaluateSync();
        displayFormula = roll.total.toString();

        // Update label with calculated value
        const typeText = damageType !== 'physical' ? ` ${damageType}` : '';
        const resourceText =
          resourceTarget !== 'hp' ? ` (${resourceTarget.toUpperCase()})` : '';
        labelText = `${displayFormula}${typeText}${resourceText}`;
      }
    } catch (error) {
      // If calculation fails, use original formula
      console.debug('Could not pre-calculate damage formula:', error);
    }
  }

  const tooltip = `Deal ${formula} ${damageType} damage to ${resourceTarget.toUpperCase()}`;

  const iconSrc = _getDamageTypeIcon(damageType);

  const dataset = {
    formula,
    damageType,
    resourceTarget,
  };

  // Store source actor UUID if available
  if (sourceActorUuid) {
    dataset.sourceActorUuid = sourceActorUuid;
  }

  return createEnricherLink({
    cssClass: 'dasu-damage-link',
    iconSrc: iconSrc,
    iconClass: iconSrc ? null : 'fa-burst', // Fallback to FA icon for untyped
    labelText,
    tooltip,
    dataset,
  });
}

/**
 * Create complete damage enricher element
 *
 * @param {Object} damageData - Parsed damage data
 * @param {string|null} sourceActorUuid - UUID of the source actor
 * @param {Actor|null} sourceActor - The source actor (if available during enrichment)
 * @returns {HTMLElement} Container with all damage links
 * @private
 */
function _createDamageLinks(damageData, sourceActorUuid, sourceActor) {
  const { customLabel, damageInstances } = damageData;

  const links = damageInstances.map((instance) =>
    _createDamageInstanceLink(
      instance,
      customLabel,
      sourceActorUuid,
      sourceActor
    )
  );

  return createEnricherContainer('dasu-damage-enricher', links);
}

/**
 * Open damage edit dialog for customizing damage before applying
 *
 * @param {Actor} sourceActor - Source actor
 * @param {string} formula - Damage formula
 * @param {string} damageType - Damage type
 * @param {string} resourceTarget - Resource target (hp, wp, both)
 * @param {HTMLElement} link - The enricher link element
 * @private
 */
async function _openDamageDialog(
  sourceActor,
  formula,
  damageType,
  resourceTarget,
  link
) {
  // Get targets
  const targets = getTargets();

  if (targets.length === 0) {
    ui.notifications.warn(
      'No targets selected. Please select targets to customize damage.'
    );
    return;
  }

  // Parse and evaluate formula for each target
  for (const target of targets) {
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

    const baseDamage = roll.total;

    // Create mock item with rolled damage value and govern: null to prevent attribute tick addition
    const mockItem = {
      name: 'Enricher Damage',
      system: {
        damage: { value: baseDamage },
        govern: null, // Prevents attribute tick from being added to damage
      },
    };

    // Open dialog for this target
    await DamageEditDialog.create({
      targetActor,
      tokenId: target.id,
      sourceActor,
      sourceItem: mockItem,
      originalDamage: baseDamage,
      originalResourceTarget: resourceTarget,
      damageType,
      govern: null, // Enricher damage doesn't add attribute tick
      damageMod: 0,
      ignoreResist: false,
      ignoreWeak: false,
      ignoreNullify: false,
      ignoreDrain: false,
    });
  }
}

/**
 * Handle damage link clicks
 *
 * @param {Event} event - Click event
 * @private
 */
async function _onDamageLinkClick(event) {
  event.preventDefault();

  const link = event.currentTarget;
  const formula = link.dataset.formula;
  const damageType = link.dataset.damageType;
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
      'No source actor found for damage. Select a token to set the source actor, then target tokens to apply damage.'
    );
    return;
  }

  // Check for prompt mode or Ctrl+Click to open dialog
  if (isPrompt || event.ctrlKey || event.metaKey) {
    await _openDamageDialog(
      sourceActor,
      formula,
      damageType,
      resourceTarget,
      link
    );
    return;
  }

  try {
    // Get targets first (needed for stack and attribute parsing)
    const targets = getTargets();
    const primaryTarget = targets[0]?.actor || null;

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

    const baseDamage = roll.total;

    if (targets.length === 0) {
      ui.notifications.warn(
        'No targets selected. Please select targets to apply damage.'
      );

      // Still show the roll in chat
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
        flavor: `${damageType} damage roll`,
      });

      return;
    }

    // Build flavor text with dice results for chat message
    const diceResults = roll.dice
      .map((d) => d.results.map((r) => r.result).join(', '))
      .join('; ');
    const flavorText = `<span class="flavor-text">${damageType} damage applied (${roll.formula}: ${diceResults} = ${baseDamage})</span>`;

    // Create mock item with rolled damage value and govern: null to prevent attribute tick addition
    const mockItem = {
      name: 'Enricher Damage',
      system: {
        damage: { value: baseDamage },
        govern: null, // Prevents attribute tick from being added to damage
      },
    };

    // Prepare target data for damage system
    const targetData = targets.map((token) => ({
      actorId: token.actor.id,
      tokenId: token.id,
      result: 'hit',
    }));

    // Apply damage using the damage system (creates chat messages with undo/edit buttons)
    await Damage.apply({
      source: {
        actor: sourceActor,
        item: mockItem,
      },
      targets: targetData,
      damageType,
      resourceTarget,
      modifiers: { multiplier: 1 },
      flavor: flavorText,
    });
  } catch (error) {
    ui.notifications.error(`Failed to process damage: ${error.message}`);
    console.error('Damage enricher error:', error);
  }
}

/**
 * Damage enricher function
 *
 * @param {RegExpMatchArray} match - Regex match
 * @param {Object} options - Enrichment options
 * @returns {Promise<HTMLElement|null>} Enriched element or null
 */
async function enrichDamageMatch(match, options) {
  const damageData = _parseDamageEnricher(match);
  if (!damageData) return null;

  // Get the source actor from options
  let sourceActor = options?.relativeTo;

  // If relativeTo is an ActiveEffect, get its parent actor
  if (sourceActor instanceof ActiveEffect) {
    sourceActor = sourceActor.parent;
  }

  // Extract actual actor if we got a token document
  if (sourceActor?.actor) {
    sourceActor = sourceActor.actor;
  }

  const sourceActorUuid = sourceActor?.uuid;

  return _createDamageLinks(damageData, sourceActorUuid, sourceActor);
}

/**
 * Initialize damage enricher
 * Registers the enricher and sets up event handlers
 */
export const initializeDamageEnricher = createEnricherInitializer({
  name: 'Damage',
  pattern: /\[\[\/damage\s+([^\]]+?)\]\](?:\{([^}]+)\})?/gi,
  enricher: wrapEnricher(enrichDamageMatch, 'damage'),
  selector: '.dasu-damage-link',
  clickHandler: _onDamageLinkClick,
});
