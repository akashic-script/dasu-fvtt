/**
 * DASU Damage System - Simplified API Export
 *
 * Provides a simple, reliable interface for the DASU damage system:
 * - Direct damage application using actor native methods
 * - DASU damage formula (POW tick + weapon damage)
 * - Resistance calculations with drain/nullify/resist/weak effects
 * - Integration with targeted individuals from checks pipeline
 *
 * @example
 * // Direct damage application
 * await Damage.apply({
 *   source: { actor: sourceActor, item: weapon },
 *   targets: [{ actorId, tokenId, result: 'hit' }],
 *   damageType: 'fire'
 * });
 *
 * // Quick damage for single target
 * await Damage.quickDamage(targetId, 5, 'fire', 'hp');
 */

import { DamageProcessor } from './processor.mjs';
import { DamageCalculator } from './core/calculator.mjs';
import { DamageEventHandlers } from './event-handlers.mjs';

/**
 * Main Damage API object
 * @namespace
 */
export const Damage = {
  // Main API methods
  /** @see DamageProcessor#applyDamage */
  apply: DamageProcessor.applyDamage.bind(DamageProcessor),
  /** @see DamageProcessor#quickDamage */
  quickDamage: DamageProcessor.quickDamage.bind(DamageProcessor),
  /** @see DamageProcessor#quickHealing */
  quickHealing: DamageProcessor.quickHealing.bind(DamageProcessor),

  // Calculator utilities
  /** @see DamageCalculator#calculateBaseDamage */
  calculateBaseDamage:
    DamageCalculator.calculateBaseDamage.bind(DamageCalculator),
  /** @see DamageCalculator#applyResistance */
  applyResistance: DamageCalculator.applyResistance.bind(DamageCalculator),
  /** @see DamageCalculator#calculateDamagePreview */
  calculateDamagePreview:
    DamageCalculator.calculateDamagePreview.bind(DamageCalculator),

  // Utility functions
  /**
   * Get resistance type name for localization
   * @param {number} resistanceValue - Resistance value (-1 to 3)
   * @returns {string} Localization key
   */
  getResistanceTypeName:
    DamageCalculator.getResistanceTypeName.bind(DamageCalculator),

  /**
   * Get CSS class for resistance styling
   * @param {number} resistanceValue - Resistance value (-1 to 3)
   * @returns {string} CSS class name
   */
  getResistanceTypeClass:
    DamageCalculator.getResistanceTypeClass.bind(DamageCalculator),

  // Legacy compatibility - these still work but are deprecated
  /** @deprecated Use Damage.apply instead */
  applyDamage: DamageProcessor.applyDamage.bind(DamageProcessor),
};

/**
 * Initialize damage system
 */
export function initializeDamageSystem() {
  // Initialize event handlers
  DamageEventHandlers.initialize();
}

// Default export
export default Damage;
