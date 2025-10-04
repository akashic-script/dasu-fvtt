/**
 * Damage Pipeline Hooks System
 *
 * Manages hooks for the damage pipeline phases and provides
 * a structured way to register callbacks for damage events.
 *
 * @example
 * // Register a damage processing hook
 * Hooks.on('dasu.processDamage', (results, damageData) => {
 *   console.log('Damage processed:', results);
 * });
 */

/**
 * Hooks management for damage pipeline
 */
export class DamageHooks {
  constructor() {
    this.callbacks = new Map();
  }

  /**
   * Register a callback for a specific damage pipeline phase
   * @param {string} phase - The phase to register for
   * @param {Function} callback - The callback function
   * @param {number} [priority=0] - Execution priority (higher = earlier)
   */
  register(phase, callback, priority = 0) {
    if (!this.callbacks.has(phase)) {
      this.callbacks.set(phase, []);
    }

    this.callbacks.get(phase).push({ callback, priority });

    // Sort by priority (highest first)
    this.callbacks.get(phase).sort((a, b) => b.priority - a.priority);
  }

  /**
   * Execute all callbacks for a specific phase
   * @param {string} phase - The phase to execute
   * @param {...any} args - Arguments to pass to callbacks
   */
  async execute(phase, ...args) {
    const callbacks = this.callbacks.get(phase) || [];

    for (const { callback } of callbacks) {
      try {
        await callback(...args);
      } catch (error) {
        // Silently continue on hook errors
      }
    }
  }

  /**
   * Clear all callbacks for a specific phase
   * @param {string} phase - The phase to clear
   */
  clear(phase) {
    this.callbacks.delete(phase);
  }

  /**
   * Clear all callbacks
   */
  clearAll() {
    this.callbacks.clear();
  }
}
