import { slugify } from '../../utils/slugify.mjs';
import { SharedActorComponents } from '../../data/shared/components.mjs';
import { DASUSettings } from '../settings.mjs';

/* global CONST */

/**
 * Extend the base Actor document by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 */
export class DASUActor extends Actor {
  /** @override */
  prepareData() {
    super.prepareData();

    if (this.type === 'daemon') {
      // this.system.prepareDaemonData(this.items); // Removed: no such method exists
    } else if (this.type === 'summoner') {
      const summonerData = this.system.prepareSummonerData(this.items);

      // Initialize core skills if needed
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

    // No AP recalculation needed; AP is now always derived.
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

    // Debug output
    // console.log({ attribute, newTick, oldTick, totalTicks, apEarned, apSpent });

    if (newTick < oldTick) {
      // Always allow decreasing
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
      // SharedActorComponents.prepareDerivedAttributes(this.system); // removed, no longer needed
      SharedActorComponents.prepareDerivedResources(this.system);
      // SharedActorComponents.getAttributePointsGetter(this.system); // remove if not used
    }

    // Handle custom resistance method effects after all standard effects are applied
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
      return { applied: 0, resourceTarget, actor: this };
    }

    // Get current values - handle different actor types
    // For daemon actors, HP is stored in system.stats.hp.current
    // For summoner actors, HP might be in system.hp.current or system.stats.hp.current
    const currentHp =
      this.system.stats?.hp?.current ?? this.system.hp?.current ?? 0;
    const currentWp =
      this.system.stats?.wp?.current ?? this.system.wp?.current ?? 0;
    const maxHp = this.system.stats?.hp?.max ?? this.system.hp?.max ?? 20;
    const maxWp = this.system.stats?.wp?.max ?? this.system.wp?.max ?? 20;

    // Debug disabled

    const updates = {};
    let appliedDamage = 0;

    // Apply HP damage
    if (resourceTarget === 'hp' || resourceTarget === 'both') {
      const newHp = Math.max(0, currentHp - damage);
      appliedDamage += currentHp - newHp;

      // Use correct path based on actor data structure
      // Prioritize system.stats.hp.current for daemons
      if (this.system.stats?.hp?.current !== undefined) {
        updates['system.stats.hp.current'] = newHp;
      } else {
        updates['system.hp.current'] = newHp;
      }
    }

    // Apply WP damage
    if (resourceTarget === 'wp' || resourceTarget === 'both') {
      const newWp = Math.max(0, currentWp - damage);
      appliedDamage += currentWp - newWp;

      // Use correct path based on actor data structure
      // Prioritize system.stats.wp.current for daemons
      if (this.system.stats?.wp?.current !== undefined) {
        updates['system.stats.wp.current'] = newWp;
      } else {
        updates['system.wp.current'] = newWp;
      }
    }

    // Apply the updates
    if (Object.keys(updates).length > 0) {
      await this.update(updates);
    }

    // Chat message creation is handled by the damage system
    // Individual messages are created for each target with more detail

    return {
      applied: appliedDamage,
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

    // Get current values - handle different actor types
    // For daemon actors, HP is stored in system.stats.hp.current
    // For summoner actors, HP might be in system.hp.current or system.stats.hp.current
    const currentHp =
      this.system.stats?.hp?.current ?? this.system.hp?.current ?? 0;
    const currentWp =
      this.system.stats?.wp?.current ?? this.system.wp?.current ?? 0;
    const maxHp = this.system.stats?.hp?.max ?? this.system.hp?.max ?? 20;
    const maxWp = this.system.stats?.wp?.max ?? this.system.wp?.max ?? 20;

    // Debug disabled

    const updates = {};
    let appliedHealing = 0;

    // Apply HP healing
    if (resourceTarget === 'hp' || resourceTarget === 'both') {
      const newHp = Math.min(maxHp, currentHp + healing);
      appliedHealing += newHp - currentHp;

      // Use correct path based on actor data structure
      // Prioritize system.stats.hp.current for daemons
      if (this.system.stats?.hp?.current !== undefined) {
        updates['system.stats.hp.current'] = newHp;
      } else {
        updates['system.hp.current'] = newHp;
      }
    }

    // Apply WP healing
    if (resourceTarget === 'wp' || resourceTarget === 'both') {
      const newWp = Math.min(maxWp, currentWp + healing);
      appliedHealing += newWp - currentWp;

      // Use correct path based on actor data structure
      // Prioritize system.stats.wp.current for daemons
      if (this.system.stats?.wp?.current !== undefined) {
        updates['system.stats.wp.current'] = newWp;
      } else {
        updates['system.wp.current'] = newWp;
      }
    }

    // Apply the updates
    if (Object.keys(updates).length > 0) {
      await this.update(updates);
    }

    // Chat message creation is handled by the damage system
    // Individual messages are created for each target with more detail

    return {
      applied: appliedHealing,
      resourceTarget,
      actor: this,
      updates,
    };
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
    return { ...super.getRollData(), ...(this.system.getRollData?.() ?? null) };
  }

  // Remove the levelUp method - leveling is now handled by the leveling wizard
}
