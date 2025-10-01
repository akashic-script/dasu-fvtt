/**
 * Hook system for Checks pipeline
 * Manages prepare callbacks for check modifications
 */

/**
 * Manages hooks and callbacks for the checks system
 */
export class CheckHooks {
  constructor() {
    this.prepareCallbacks = new Map();
  }

  registerPrepareCallback(checkId, callback, priority = 0) {
    if (!this.prepareCallbacks.has(checkId)) {
      this.prepareCallbacks.set(checkId, []);
    }

    this.prepareCallbacks.get(checkId).push({ callback, priority });
    this._sortCallbacks(this.prepareCallbacks.get(checkId));
  }

  async executePrepareCallbacks(check, actor, item) {
    const callbacks = this.prepareCallbacks.get(check.id) || [];

    for (const { callback } of callbacks) {
      try {
        await callback(check);
      } catch (error) {
        // Silently continue on callback errors
      }
    }

    // Clean up after execution
    this.prepareCallbacks.delete(check.id);
  }

  _sortCallbacks(callbacks) {
    callbacks.sort((a, b) => b.priority - a.priority);
  }
}
