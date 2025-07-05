import { slugify } from '../utils/slugify.mjs';
import { SharedActorComponents } from '../data/shared/components.mjs';
import { DASUSettings } from '../settings.mjs';

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
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);

    // Set dsid based on the actor's name if not already set
    if (!data.system?.dsid && data.name) {
      data.system = data.system || {};
      data.system.dsid = slugify(data.name);
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
   */
  prepareDerivedData() {
    const actorData = this;
    const flags = actorData.flags.dasu || {};

    if (['daemon', 'summoner'].includes(this.type)) {
      // SharedActorComponents.prepareDerivedAttributes(this.system); // removed, no longer needed
      SharedActorComponents.prepareDerivedResources(this.system);
      // SharedActorComponents.getAttributePointsGetter(this.system); // remove if not used
    }
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
