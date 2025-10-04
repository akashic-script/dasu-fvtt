/**
 * Effect Application Pipeline for DASU
 * Single source of truth for all effect creation and application
 * Provides hooks for module developers to extend behavior
 */

/**
 * Effect Application Processor
 * Handles the complete lifecycle of effect application with a hook-based pipeline
 */
export class EffectProcessor {
  /**
   * Apply an effect to an actor using the standardized pipeline
   * @param {Actor} actor - Target actor
   * @param {Object} effectData - Effect configuration
   * @param {Object} options - Application options
   * @param {boolean} [options.toggle=false] - Toggle effect on/off if it exists
   * @param {Actor} [options.source] - Source actor who applied the effect
   * @param {Item} [options.item] - Source item that triggered the effect
   * @param {string} [options.origin] - Origin UUID for the effect
   * @returns {Promise<ActiveEffect|null>} Created effect or null if toggled off
   */
  static async applyEffect(actor, effectData, options = {}) {
    // Phase 1: Pre-process - Allow modifications before any logic
    const preprocessResult = await this._runHook('preProcessEffect', {
      actor,
      effectData: foundry.utils.deepClone(effectData),
      options,
    });

    if (preprocessResult.prevented) {
      return null;
    }

    // Phase 2: Normalize effect data
    const normalized = await this._normalizeEffectData(
      preprocessResult.effectData,
      options
    );

    // Phase 3: Handle toggle behavior
    if (options.toggle) {
      const existing = this._findExistingEffect(actor, normalized);
      if (existing) {
        await existing.delete();
        return null;
      }
    }

    // Phase 4: Setup custom duration tracking
    const withDuration = await this._setupCustomDuration(normalized);

    // Phase 5: Handle stackable effects
    if (withDuration.flags?.dasu?.stackable) {
      return this._applyStackableEffect(actor, withDuration, options);
    }

    // Phase 6: Pre-create hook - Final chance to modify before creation
    const precreateResult = await this._runHook('preCreateEffect', {
      actor,
      effectData: withDuration,
      options,
    });

    if (precreateResult.prevented) {
      return null;
    }

    // Phase 7: Create the effect
    // Mark this as processed by DASU to avoid duplicate duration conversion in preCreateActiveEffect hook
    const createOptions = { ...options, dasuProcessed: true };
    const [created] = await actor.createEmbeddedDocuments(
      'ActiveEffect',
      [precreateResult.effectData],
      createOptions
    );

    // Phase 8: Post-create hook - Notify after creation
    await this._runHook('postCreateEffect', {
      actor,
      effect: created,
      options,
    });

    return created;
  }

  /**
   * Normalize effect data to ensure consistent structure
   * @private
   */
  static async _normalizeEffectData(effectData, options) {
    const normalized = foundry.utils.deepClone(effectData);

    // Ensure required fields exist
    normalized.name = normalized.name || 'Unnamed Effect';
    normalized.icon = normalized.icon || normalized.img || 'icons/svg/aura.svg';
    normalized.duration = normalized.duration || {};
    normalized.flags = normalized.flags || {};
    normalized.flags.dasu = normalized.flags.dasu || {};

    // Set origin if provided
    if (options.origin) {
      normalized.origin = options.origin;
    } else if (options.source) {
      normalized.origin = options.source.uuid;
    }

    // Set description if provided
    if (effectData.description && typeof effectData.description === 'string') {
      normalized.description = game.i18n.localize(effectData.description);
    }

    return normalized;
  }

  /**
   * Setup custom duration tracking for rounds/turns
   * @private
   */
  static async _setupCustomDuration(effectData) {
    // Only process if there's an active combat
    if (!game.combat) {
      return effectData;
    }

    const updated = foundry.utils.deepClone(effectData);

    // Convert rounds to custom tracking
    if (updated.duration?.rounds && !updated.flags?.dasu?.remainingRounds) {
      updated.flags.dasu.remainingRounds = updated.duration.rounds;
      updated.flags.dasu.linkedCombat = game.combat.id;
      // Keep duration.rounds for display purposes
    }

    // Convert turns to custom tracking
    if (updated.duration?.turns && !updated.flags?.dasu?.remainingTurns) {
      updated.flags.dasu.remainingTurns = updated.duration.turns;
      updated.flags.dasu.linkedCombat = game.combat.id;
      updated.flags.dasu.startRound = game.combat.round;
      updated.flags.dasu.startTurn = game.combat.turn;
      updated.flags.dasu.hasDecrementedOnce = false;
    }

    return updated;
  }

  /**
   * Apply a stackable effect
   * @private
   */
  static async _applyStackableEffect(actor, effectData, options) {
    const stackId = effectData.flags.dasu.stackId;
    if (!stackId) {
      console.warn(
        'DASU | Effects Pipeline | Stackable effect missing stackId, applying as normal effect'
      );
      return this.applyEffect(
        actor,
        {
          ...effectData,
          flags: {
            ...effectData.flags,
            dasu: { ...effectData.flags.dasu, stackable: false },
          },
        },
        options
      );
    }

    // Check if we've hit max stacks
    const maxStacks = effectData.flags.dasu.maxStacks;
    if (maxStacks) {
      const currentCount = actor.getEffectStackCount?.(stackId) || 0;
      if (currentCount >= maxStacks) {
        ui.notifications.warn(
          `Cannot add more stacks of ${effectData.name} (max: ${maxStacks})`
        );
        return null;
      }
    }

    // Create a new stack
    const [created] = await actor.createEmbeddedDocuments('ActiveEffect', [
      effectData,
    ]);
    return created;
  }

  /**
   * Find an existing effect on the actor
   * @private
   */
  static _findExistingEffect(actor, effectData) {
    // Check by status ID first
    if (effectData.statuses?.length > 0) {
      const statusId = Array.from(effectData.statuses)[0];
      const existing = actor.effects.find((e) => e.statuses.has(statusId));
      if (existing) return existing;
    }

    // Check by stack ID for stackable effects
    if (effectData.flags?.dasu?.stackable && effectData.flags?.dasu?.stackId) {
      return null; // Stackable effects don't toggle - they stack
    }

    // Check by name as fallback
    return actor.effects.find((e) => e.name === effectData.name);
  }

  /**
   * Run a hook and allow modifications to the pipeline data
   * @private
   */
  static async _runHook(hookName, data) {
    const fullHookName = `dasu.effects.${hookName}`;
    const result = { ...data, prevented: false };

    // Call the hook
    const hookResult = Hooks.call(fullHookName, result);

    // If any hook returned false, prevent the action
    if (hookResult === false) {
      result.prevented = true;
    }

    return result;
  }
}
