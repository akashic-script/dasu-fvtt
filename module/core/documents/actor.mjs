import { slugify } from '../../utils/slugify.mjs';
import { SharedActorComponents } from '../../data/shared/components.mjs';
import { DASUSettings } from '../settings.mjs';

/* global CONST, fromUuidSync */

// Global WeakSet to track actors currently resolving @origin references
const _resolvingActors = new WeakSet();

/**
 * Extend the base Actor document by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 */
export class DASUActor extends Actor {
  /** @override */
  prepareData() {
    super.prepareData();

    if (this.type === 'summoner') {
      const summonerData = this.system.prepareSummonerData(this.items);

      if (summonerData.needsCoreSkillInit) {
        Hooks.once('ready', () => {
          this.initializeCoreSkills();
        });
      }
    }
  }

  /** @override */
  async _preCreate(createData, options, user) {
    await super._preCreate(createData, options, user);

    // Set dsid based on the actor's name if not already set
    if (!createData.system?.dsid && createData.name) {
      createData.system = createData.system || {};
      createData.system.dsid = slugify(createData.name);
    }

    // Set default prototype token settings for summoners
    if (this.type === 'summoner') {
      this.updateSource({
        prototypeToken: {
          actorLink: true,
          disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY,
        },
      });
    }
  }

  /** @override */
  async _preUpdate(changed, options, user) {
    await super._preUpdate(changed, options, user);

    // Update dsid if the name changed and dsid is empty
    if (changed.name && (!this.system.dsid || this.system.dsid === '')) {
      changed.system = changed.system || {};
      changed.system.dsid = slugify(changed.name);
    }
  }

  /**
   * Initialize core skills if they don't exist (Summoner only)
   */
  async initializeCoreSkills() {
    if (this.type !== 'summoner') return;

    const addedSkills = this.system.initializeCoreSkills();
    if (addedSkills.length > 0) {
      await this.update({ 'system.skills': this.system.skills });
    }
  }

  // ===== DELEGATED METHODS - These now call the data model methods =====

  /**
   * Get all skills (Summoner only) - Delegates to data model
   * @returns {Array} Array of all skills
   */
  getAllSkills() {
    if (this.type !== 'summoner') return [];
    return this.system.getAllSkills();
  }

  /**
   * Get skills organized by type (Summoner only) - Delegates to data model
   * @returns {Object} Object with coreSkills and customSkills arrays
   */
  getSkillsByType() {
    if (this.type !== 'summoner') return { coreSkills: [], customSkills: [] };
    return this.system.getSkillsByType();
  }

  /**
   * Add a new custom skill (Summoner only) - Delegates to data model
   * @param {Object} skillData - Skill data object
   */
  async addCustomSkill(skillData) {
    if (this.type !== 'summoner') return null;

    const newSkill = this.system.addCustomSkill(skillData);
    if (newSkill) {
      await this.update({ 'system.skills': this.system.skills });
    }
    return newSkill;
  }

  /**
   * Remove a skill by ID (Summoner only) - Delegates to data model
   * @param {string} skillId - ID of the skill to remove
   */
  async removeSkill(skillId) {
    if (this.type !== 'summoner') return false;

    const success = this.system.removeSkill(skillId);
    if (success) {
      await this.update({ 'system.skills': this.system.skills });
    }
    return success;
  }

  /**
   * Update a skill by ID (Summoner only) - Delegates to data model
   * @param {string} skillId - ID of the skill to update
   * @param {Object} updates - Partial skill data to update
   */
  async updateSkill(skillId, updates) {
    if (this.type !== 'summoner') return false;

    const success = this.system.updateSkill(skillId, updates);
    if (success) {
      await this.update({ 'system.skills': this.system.skills });
    }
    return success;
  }

  /**
   * Get a specific skill by ID (Summoner only) - Delegates to data model
   * @param {string} skillId - The skill ID to retrieve
   * @returns {Object|null} The skill object or null if not found
   */
  getSkill(skillId) {
    if (this.type !== 'summoner') return null;
    return this.system.getSkill(skillId);
  }

  /**
   * Get a skill by name (case-insensitive) (Summoner only) - Delegates to data model
   * @param {string} skillName - The skill name to retrieve
   * @returns {Object|null} The skill object or null if not found
   */
  getSkillByName(skillName) {
    if (this.type !== 'summoner') return null;
    return this.system.getSkillByName(skillName);
  }

  /**
   * Calculate total skill value (base + governing attribute + mod) (Summoner only) - Delegates to data model
   * @param {string} skillId - The skill ID to calculate
   * @returns {number} Total skill value
   */
  getSkillTotal(skillId) {
    if (this.type !== 'summoner') return 0;
    return this.system.getSkillTotal(skillId, this.system.attributes);
  }

  /**
   * Get all skills with their calculated totals (Summoner only) - Delegates to data model
   * @returns {Array} Array of skills with total values
   */
  getSkillsWithTotals() {
    if (this.type !== 'summoner') return [];
    return this.system.getSkillsWithTotals(this.system.attributes);
  }

  /**
   * Set the tick value for an attribute, enforcing AP and tick limits.
   * @param {string} attribute - The attribute to set ('pow', 'dex', 'will', 'sta')
   * @param {number} newTick - The new tick value (1-6)
   * @returns {boolean} Success status
   */
  async setAttributeTick(attribute, newTick) {
    if (!['pow', 'dex', 'will', 'sta'].includes(attribute)) return false;
    if (newTick < 1 || newTick > 6) {
      ui.notifications.warn('Tick must be between 1 and 6.');
      return false;
    }

    // Calculate total ticks if this change is applied
    const attrs = { ...this.system.attributes };
    const oldTick = attrs[attribute]?.tick ?? 1;
    let totalTicks = 0;
    for (const key of Object.keys(attrs)) {
      totalTicks += key === attribute ? newTick : attrs[key]?.tick ?? 1;
    }

    // Calculate AP
    const startingAP = game.settings.get('dasu', 'startingAP');
    const level = this.system.level ?? 1;
    const startingTicks = 4;
    const apFormula = game.settings.get('dasu', 'apFormula') || 'odd:1-29';
    const apEarned = startingAP + globalThis.DASU.calculateAP(level, apFormula);
    const apSpent = totalTicks - startingTicks;

    if (newTick < oldTick) {
      /* empty */
    } else {
      if (newTick > 6) {
        ui.notifications.warn('Cannot increase above 6 ticks.');
        return false;
      }
      if (apSpent > apEarned) {
        ui.notifications.warn(
          `Not enough AP. AP spent: ${apSpent}, AP earned: ${apEarned}`
        );
        return false;
      }
    }

    await this.update({ [`system.attributes.${attribute}.tick`]: newTick });
    return true;
  }

  /** @override */
  prepareBaseData() {
    // Data modifications in this step occur before processing embedded
    // documents or derived data.
  }

  /**
   * @override
   * Apply all ActiveEffect documents to the Actor data.
   * Override to support @origin references in effect values.
   */
  applyActiveEffects() {
    // Prevent infinite recursion
    if (_resolvingActors.has(this)) {
      return super.applyActiveEffects();
    }
    _resolvingActors.add(this);

    try {
      const rollData = this.getRollData();

      for (const effect of this.allApplicableEffects()) {
        for (const change of effect.changes) {
          if (typeof change.value !== 'string' || !change.value.includes('@')) {
            continue;
          }

          let value = change.value;

          // Handle @origin references
          if (value.includes('@origin') && effect.origin) {
            const origin = fromUuidSync(effect.origin);
            if (origin) {
              const originRollData = origin.getRollData
                ? origin.getRollData()
                : {};
              // Add @origin to the data for replaceFormulaData
              const data = { ...rollData, origin: originRollData };
              value = Roll.replaceFormulaData(value, data, {
                missing: undefined,
                warn: false,
              });
            }
          }

          // Handle @ references to self
          if (value.includes('@')) {
            value = Roll.replaceFormulaData(value, rollData, {
              missing: undefined,
              warn: false,
            });
          }

          // Evaluate the expression if it contains arithmetic
          if (/[+\-*/()]/.test(value) && isNaN(value)) {
            try {
              change.value = String(Roll.safeEval(value));
            } catch (err) {
              // Ignore errors for dice formulas
            }
          } else {
            change.value = value;
          }
        }
      }

      // Now apply effects normally with resolved values
      return super.applyActiveEffects();
    } finally {
      _resolvingActors.delete(this);
    }
  }

  /**
   * @override
   * Augment the actor source data with additional dynamic data that isn't
   * handled by the actor's DataModel. Data calculated in this step should be
   * available both inside and outside of summoner sheets (such as if an actor
   * is queried and has a roll executed directly from it).
   *
   * Also includes processing of custom resistance method effects.
   */
  prepareDerivedData() {
    super.prepareDerivedData();
    const actorData = this;
    const flags = actorData.flags.dasu || {};

    if (['daemon', 'summoner'].includes(this.type)) {
      SharedActorComponents.prepareDerivedResources(this.system);
    }

    this._applyResistanceMethodEffects();
  }

  /**
   * Apply method-based resistance effects from Active Effects
   * Processes effects that use method strings like "upgrade", "downgrade", etc.
   * @private
   */
  _applyResistanceMethodEffects() {
    if (!this.system.resistances) return;

    // Find all active effects that target resistance method paths
    const methodEffects = this.allApplicableEffects().filter((effect) =>
      effect.changes.some(
        (change) =>
          change.key.startsWith('system.resistances.') &&
          change.key.endsWith('.method') &&
          change.mode === 0 // Custom mode
      )
    );

    // Process each method effect
    for (const effect of methodEffects) {
      for (const change of effect.changes) {
        // Skip non-method resistance changes
        if (
          !change.key.startsWith('system.resistances.') ||
          !change.key.endsWith('.method') ||
          change.mode !== 0
        ) {
          continue;
        }

        // Extract resistance type from key (e.g., "system.resistances.fire.method" -> "fire")
        const resistanceType = change.key
          .replace('system.resistances.', '')
          .replace('.method', '');
        const resistance = this.system.resistances[resistanceType];

        if (!resistance) continue;

        const method = change.value?.toString().toLowerCase();
        let newValue = resistance.base;

        // Apply the method to calculate new resistance value
        switch (method) {
          case 'upgrade':
            newValue = Math.min(resistance.base + 1, 3);
            break;
          case 'downgrade':
            newValue = Math.max(resistance.base - 1, -1);
            break;
          case 'weak':
          case 'wk':
            newValue = -1;
            break;
          case 'resist':
          case 'rs':
            newValue = 1;
            break;
          case 'nullify':
          case 'nu':
            newValue = 2;
            break;
          case 'drain':
          case 'dr':
            newValue = 3;
            break;
          default:
            // Try to parse as a numeric value
            const numValue = Number(method);
            if (!isNaN(numValue)) {
              newValue = Math.max(-1, Math.min(3, numValue));
            }
            break;
        }

        // Apply the calculated resistance value
        resistance.current = newValue;
      }
    }
  }

  /**
   * Apply damage to this actor
   * @param {number} damage - Amount of damage to apply
   * @param {string} damageType - Type of damage (physical, fire, ice, etc.)
   * @param {string} resourceTarget - Target resource ('hp', 'wp', or 'both')
   * @param {Object} options - Additional options for damage application
   * @returns {Promise<Object>} Result of damage application
   */
  async applyDamage(
    damage,
    damageType = 'physical',
    resourceTarget = 'hp',
    options = {}
  ) {
    // Ensure damage is a positive integer
    damage = Math.max(0, Math.round(damage));

    if (damage === 0) {
      return {
        applied: 0,
        resourceTarget,
        actor: this,
        tempDepleted: 0,
        actualDamage: 0,
      };
    }

    // Get current values - handle different actor types
    // For daemon actors, HP is stored in system.stats.hp.current
    // For summoner actors, HP might be in system.hp.current or system.stats.hp.current
    const currentHp =
      this.system.stats?.hp?.current ?? this.system.hp?.current ?? 0;
    const currentWp =
      this.system.stats?.wp?.current ?? this.system.wp?.current ?? 0;
    const tempHp = this.system.stats?.hp?.temp ?? 0;
    const tempWp = this.system.stats?.wp?.temp ?? 0;
    const maxHp = this.system.stats?.hp?.max ?? this.system.hp?.max ?? 20;
    const maxWp = this.system.stats?.wp?.max ?? this.system.wp?.max ?? 20;

    const updates = {};
    let appliedDamage = 0;
    let tempDepleted = 0;

    // Apply HP damage (temp HP first, then regular HP)
    if (resourceTarget === 'hp' || resourceTarget === 'both') {
      let remaining = damage;

      // 1. Deplete temp HP first
      if (tempHp > 0) {
        const tempUsed = Math.min(remaining, tempHp);
        tempDepleted += tempUsed;
        remaining -= tempUsed;

        if (this.system.stats?.hp?.temp !== undefined) {
          updates['system.stats.hp.temp'] = tempHp - tempUsed;
        }
      }

      // 2. Apply remaining damage to current HP
      if (remaining > 0) {
        const newHp = Math.max(0, currentHp - remaining);
        appliedDamage += currentHp - newHp;

        if (this.system.stats?.hp?.current !== undefined) {
          updates['system.stats.hp.current'] = newHp;
        } else {
          updates['system.hp.current'] = newHp;
        }
      }
    }

    // Apply WP damage (temp WP first, then regular WP)
    if (resourceTarget === 'wp' || resourceTarget === 'both') {
      let remaining = damage;

      // 1. Deplete temp WP first
      if (tempWp > 0) {
        const tempUsed = Math.min(remaining, tempWp);
        tempDepleted += tempUsed;
        remaining -= tempUsed;

        if (this.system.stats?.wp?.temp !== undefined) {
          updates['system.stats.wp.temp'] = tempWp - tempUsed;
        }
      }

      // 2. Apply remaining damage to current WP
      if (remaining > 0) {
        const newWp = Math.max(0, currentWp - remaining);
        appliedDamage += currentWp - newWp;

        if (this.system.stats?.wp?.current !== undefined) {
          updates['system.stats.wp.current'] = newWp;
        } else {
          updates['system.wp.current'] = newWp;
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      await this.update(updates);
    }

    return {
      applied: appliedDamage,
      tempDepleted,
      actualDamage: appliedDamage,
      totalDamage: damage,
      resourceTarget,
      actor: this,
      updates,
    };
  }

  /**
   * Apply healing to this actor
   * @param {number} healing - Amount of healing to apply
   * @param {string} resourceTarget - Target resource ('hp', 'wp', or 'both')
   * @param {Object} options - Additional options for healing application
   * @returns {Promise<Object>} Result of healing application
   */
  async applyHealing(healing, resourceTarget = 'hp', options = {}) {
    // Ensure healing is a positive integer
    healing = Math.max(0, Math.round(healing));

    if (healing === 0) {
      return { applied: 0, resourceTarget, actor: this };
    }

    const currentHp =
      this.system.stats?.hp?.current ?? this.system.hp?.current ?? 0;
    const currentWp =
      this.system.stats?.wp?.current ?? this.system.wp?.current ?? 0;
    const maxHp = this.system.stats?.hp?.max ?? this.system.hp?.max ?? 20;
    const maxWp = this.system.stats?.wp?.max ?? this.system.wp?.max ?? 20;

    const updates = {};
    let appliedHealing = 0;

    if (resourceTarget === 'hp' || resourceTarget === 'both') {
      const newHp = Math.min(maxHp, currentHp + healing);
      appliedHealing += newHp - currentHp;

      if (this.system.stats?.hp?.current !== undefined) {
        updates['system.stats.hp.current'] = newHp;
      } else {
        updates['system.hp.current'] = newHp;
      }
    }

    if (resourceTarget === 'wp' || resourceTarget === 'both') {
      const newWp = Math.min(maxWp, currentWp + healing);
      appliedHealing += newWp - currentWp;

      if (this.system.stats?.wp?.current !== undefined) {
        updates['system.stats.wp.current'] = newWp;
      } else {
        updates['system.wp.current'] = newWp;
      }
    }

    if (Object.keys(updates).length > 0) {
      await this.update(updates);
    }

    return {
      applied: appliedHealing,
      resourceTarget,
      actor: this,
      updates,
    };
  }

  /**
   * Add temporary HP to actor (stacks with existing temp HP)
   * @param {number} amount - Amount of temp HP to add
   * @param {string} resource - Resource type ('hp' or 'wp')
   * @returns {Promise<Actor>}
   */
  async addTempHP(amount, resource = 'hp') {
    if (!['hp', 'wp'].includes(resource)) {
      console.warn(`Invalid resource type: ${resource}. Must be 'hp' or 'wp'.`);
      return this;
    }

    const currentTemp = this.system.stats[resource].temp ?? 0;
    const newTemp = currentTemp + amount;

    await this.update({
      [`system.stats.${resource}.temp`]: newTemp,
    });

    ui.notifications.info(
      `${
        this.name
      } gains ${amount} temporary ${resource.toUpperCase()}! (Total: ${newTemp})`
    );

    return this;
  }

  /**
   * Remove temporary HP from a specific resource
   * @param {string} resource - Resource type ('hp' or 'wp')
   * @returns {Promise<Actor>}
   */
  async removeTempHP(resource = 'hp') {
    if (!['hp', 'wp'].includes(resource)) {
      console.warn(`Invalid resource type: ${resource}. Must be 'hp' or 'wp'.`);
      return this;
    }

    await this.update({
      [`system.stats.${resource}.temp`]: 0,
    });

    return this;
  }

  /**
   * Remove all temporary HP from all resources
   * @returns {Promise<Actor>}
   */
  async clearAllTempHP() {
    await this.update({
      'system.stats.hp.temp': 0,
      'system.stats.wp.temp': 0,
    });

    return this;
  }

  /* -------------------------------------------- */
  /*  Stackable Effect Methods                    */
  /* -------------------------------------------- */

  /**
   * Get the current stack count for a specific effect
   * Uses the currentStacks property from the single effect document
   * @param {string} stackId - The stack identifier
   * @returns {number} Number of active stacks
   */
  getEffectStackCount(stackId) {
    if (!stackId) return 0;

    const effect = this.effects.find(
      (e) => e.flags.dasu?.stackId === stackId && !e.disabled
    );

    return effect?.flags.dasu?.currentStacks || 0;
  }

  /**
   * Get the stackable effect by stackId
   * @param {string} stackId - The stack identifier
   * @returns {ActiveEffect|null} The effect or null
   */
  getStackableEffect(stackId) {
    if (!stackId) return null;

    return this.effects.find(
      (e) => e.flags.dasu?.stackId === stackId && !e.disabled
    );
  }

  /**
   * Add a stackable effect with automatic stack limit checking
   * DEPRECATED: Use EffectProcessor.applyEffect() instead
   * This method is kept for backwards compatibility
   * @param {object} effectData - The effect data to add
   * @returns {ActiveEffect|null} The created/updated effect or null if limit reached
   */
  async addStackableEffect(effectData) {
    const stackId = effectData.flags?.dasu?.stackId;
    const isStackable = effectData.flags?.dasu?.stackable;

    if (!isStackable || !stackId) {
      // Non-stackable effect, create normally
      const [effect] = await this.createEmbeddedDocuments('ActiveEffect', [
        effectData,
      ]);
      return effect;
    }

    // Use the EffectProcessor for proper stacking behavior
    const EffectProcessor = (
      await import('../../systems/effects/processor.mjs')
    ).EffectProcessor;
    return await EffectProcessor.applyEffect(this, effectData);
  }

  /**
   * Remove one stack of an effect
   * @param {string} stackId - The stack identifier
   * @returns {Promise<void>}
   */
  async removeEffectStack(stackId) {
    const effect = this.getStackableEffect(stackId);

    if (!effect) return;

    const currentStacks = effect.flags.dasu.currentStacks || 1;

    if (currentStacks <= 1) {
      // Last stack - delete the effect entirely
      await effect.delete();
      Hooks.call('dasu.effectStackRemoved', this, effect, 0);
    } else {
      // Decrement stack count
      const newStacks = currentStacks - 1;
      await effect.update({
        'flags.dasu.currentStacks': newStacks,
      });
      Hooks.call('dasu.effectStackRemoved', this, effect, newStacks);
    }
  }

  /**
   * Override toggleStatusEffect to ensure flags are copied from status conditions
   * @override
   */
  async toggleStatusEffect(statusId, options = {}) {
    // Get the status condition definition
    const statusCondition = CONFIG.DASU_STATUS_CONDITIONS?.[statusId];

    // If this is a stackable status and we're adding it, use the stackable method
    if (statusCondition?.flags?.dasu?.stackable && options.active !== false) {
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

      // If there's an active combat and duration has rounds, link it to the combat
      // Note: turns use custom tracking and shouldn't be linked to combat
      if (game.combat && effectData.duration?.rounds) {
        effectData.duration.combat = game.combat.id;
        effectData.duration.startRound = game.combat.round;
        effectData.duration.startTurn = game.combat.turn;
      }

      // If using turn-based duration, set up custom tracking
      if (game.combat && effectData.duration?.turns) {
        effectData.flags.dasu = effectData.flags.dasu || {};
        effectData.flags.dasu.remainingTurns = effectData.duration.turns;
        effectData.flags.dasu.linkedCombat = game.combat.id;
        effectData.flags.dasu.startRound = game.combat.round;
        effectData.flags.dasu.startTurn = game.combat.turn;
        effectData.flags.dasu.hasDecrementedOnce = false;
        effectData.duration.turns = null;
      }

      console.log('DASU | Creating stackable effect with data:', effectData);
      const result = await this.addStackableEffect(effectData);
      console.log('DASU | Created effect:', result);
      return result;
    }

    // For non-stackable effects, we need to handle custom turn tracking too
    console.log('DASU | toggleStatusEffect for non-stackable:', {
      statusId,
      hasStatusCondition: !!statusCondition,
      optionsActive: options.active,
      hasDefaultDuration: !!statusCondition?.duration,
      hasTurns: !!statusCondition?.duration?.turns,
    });

    if (statusCondition && options.active !== false) {
      // Check if we're adding the effect
      const hasEffect = this.effects.some((e) => e.statuses.has(statusId));
      console.log('DASU | Effect check:', { hasEffect, statusId });

      if (!hasEffect && statusCondition.duration?.turns) {
        // Create effect with custom turn tracking
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
          effectData.description = game.i18n.localize(
            statusCondition.description
          );
        }

        if (statusCondition.changes) {
          effectData.changes = foundry.utils.deepClone(statusCondition.changes);
        }

        // Link rounds to combat
        if (game.combat && effectData.duration?.rounds) {
          effectData.duration.combat = game.combat.id;
          effectData.duration.startRound = game.combat.round;
          effectData.duration.startTurn = game.combat.turn;
        }

        // Set up custom turn tracking
        if (game.combat && effectData.duration?.turns) {
          effectData.flags.dasu = effectData.flags.dasu || {};
          effectData.flags.dasu.remainingTurns = effectData.duration.turns;
          effectData.flags.dasu.linkedCombat = game.combat.id;
          effectData.flags.dasu.startRound = game.combat.round;
          effectData.flags.dasu.startTurn = game.combat.turn;
          effectData.flags.dasu.hasDecrementedOnce = false;
          effectData.duration.turns = null;
        }

        console.log(
          'DASU | Creating non-stackable effect with custom turn tracking:',
          effectData
        );
        const [effect] = await this.createEmbeddedDocuments('ActiveEffect', [
          effectData,
        ]);
        return effect;
      }
    }

    // For removal or effects without custom tracking, use default behavior
    return await super.toggleStatusEffect(statusId, options);
  }

  /* -------------------------------------------- */
  /*  Equipment Slot Methods                       */
  /* -------------------------------------------- */

  /**
   * Equip a weapon to the weapon slot
   * @param {string} weaponId - The ID of the weapon item to equip
   * @returns {Promise<boolean>} Success status
   */
  async equipWeapon(weaponId) {
    const weapon = this.items.get(weaponId);
    if (!weapon || weapon.type !== 'weapon') {
      ui.notifications.error('Invalid weapon');
      return false;
    }

    // Unequip currently equipped weapon if any
    if (this.system.equipped.weapon) {
      await this.unequipWeapon();
    }

    await this.update({ 'system.equipped.weapon': weapon.uuid });

    // Re-apply active effects to update weapon-based effects
    this.applyActiveEffects();

    ui.notifications.info(`Equipped ${weapon.name}`);
    return true;
  }

  /**
   * Unequip the currently equipped weapon
   * @returns {Promise<boolean>} Success status
   */
  async unequipWeapon() {
    if (!this.system.equipped.weapon) return false;

    const weapon = await fromUuid(this.system.equipped.weapon);
    await this.update({ 'system.equipped.weapon': null });

    // Re-apply active effects to update weapon-based effects
    this.applyActiveEffects();

    if (weapon) {
      ui.notifications.info(`Unequipped ${weapon.name}`);
    }
    return true;
  }

  /**
   * Get the currently equipped weapon
   * @returns {Promise<Item|null>} The equipped weapon or null
   */
  async getEquippedWeapon() {
    if (!this.system.equipped.weapon) return null;
    return await fromUuid(this.system.equipped.weapon);
  }

  /**
   * Check if a specific weapon is equipped
   * @param {string} weaponId - The ID of the weapon item
   * @returns {boolean} True if the weapon is equipped
   */
  isWeaponEquipped(weaponId) {
    if (!this.system.equipped.weapon) return false;
    const weapon = this.items.get(weaponId);
    return weapon?.uuid === this.system.equipped.weapon;
  }

  /**
   *
   * @override
   * Augment the actor's default getRollData() method by appending the data object
   * generated by the its DataModel's getRollData(), or null. This polymorphic
   * approach is useful when you have actors & items that share a parent Document,
   * but have slightly different data preparation needs.
   */
  getRollData() {
    const data = { ...this };

    // Add DASU aliases from config
    if (globalThis.DASU?.rollDataAliases) {
      for (const [alias, path] of Object.entries(
        globalThis.DASU.rollDataAliases
      )) {
        const value = foundry.utils.getProperty(this, path);
        if (value !== undefined) {
          foundry.utils.setProperty(data, alias, value);
        }
      }
    }

    return data;
  }

  // Remove the levelUp method - leveling is now handled by the leveling wizard
}
