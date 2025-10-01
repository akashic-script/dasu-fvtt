/**
 * @fileoverview Damage Text Enricher
 *
 * Implements inline damage enrichers for the DASU system, allowing embedding of damage
 * calculations directly into text fields.
 *
 * Syntax:
 * [[/damage formula [type] [resource]]]
 * [[/damage formula type resource & formula type resource]] - Multiple instances
 *
 * @example
 * [[/damage 2d6]] - Roll 2d6 damage (defaults to physical, HP)
 * [[/damage 1d8 fire]] - Roll 1d8 fire damage to HP
 * [[/damage 2d4 dark wp]] - Roll 2d4 dark damage to WP
 * [[/damage @pow light]] - Deal light damage equal to Power tick
 * [[/damage 2d6 fire hp]] - Roll 2d6 fire damage explicitly to HP
 * [[/damage 1d6 fire hp & 1d4 dark wp]] - Multiple damage instances
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

  const formula = tokens[0];
  let damageType = 'physical';
  let resourceTarget = 'hp';

  // Process remaining tokens for type and resource
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];

    if (DAMAGE_TYPES.includes(token.toLowerCase())) {
      damageType = token.toLowerCase();
    } else if (RESOURCE_TARGETS.includes(token.toLowerCase())) {
      resourceTarget = token.toLowerCase();
    } else if (token.includes('/') || token.toLowerCase() === 'prompt') {
      // Multiple damage types (e.g., "fire/ice") or prompt
      damageType = token.toLowerCase();
    }
  }

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
 * @returns {HTMLElement} Damage link element
 * @private
 */
function _createDamageInstanceLink(instance, customLabel, sourceActorUuid) {
  const { formula, damageType, resourceTarget } = instance;

  const labelText = customLabel || _generateDamageLabel(instance);
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
 * @returns {HTMLElement} Container with all damage links
 * @private
 */
function _createDamageLinks(damageData, sourceActorUuid) {
  const { customLabel, damageInstances } = damageData;

  const links = damageInstances.map((instance) =>
    _createDamageInstanceLink(instance, customLabel, sourceActorUuid)
  );

  return createEnricherContainer('dasu-damage-enricher', links);
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

  // Try to get source actor from stored UUID first
  let sourceActor = sourceActorUuid ? await fromUuid(sourceActorUuid) : null;

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

  try {
    // Evaluate the formula with roll data
    const rollData = sourceActor.getRollData();
    const roll = new Roll(formula, rollData);
    await roll.evaluate();

    const baseDamage = roll.total;

    // Get targets
    const targets = getTargets();

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

  // Store the relativeTo document UUID for later retrieval
  const sourceActor = options?.relativeTo;
  const sourceActorUuid = sourceActor?.uuid;

  return _createDamageLinks(damageData, sourceActorUuid);
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
