import { slugify } from '../utils/slugify.mjs';

/**
 * Extend the base Actor document by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 */
export class DASUActor extends Actor {
  /** @override */
  prepareData() {
    super.prepareData();

    if (this.type === 'daemon') {
      this.prepareDaemonData();
      this.prepareAttributeData();
    } else if (this.type === 'summoner') {
      this.prepareAttributeData();
      this.prepareSummonerData();
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

    // Recalculate AP if level changes
    if (changed.system?.level !== undefined) {
      const newLevel = changed.system.level;
      const newMaxAP = 8 + (newLevel - 1) * 2;

      // Calculate current allocated points
      let totalAllocated = 0;
      if (this.system.attributes) {
        for (const [attrKey, attr] of Object.entries(this.system.attributes)) {
          const currentBase = attr.base || 3;
          const allocated = Math.max(0, currentBase - 3);
          totalAllocated += allocated;
        }
      }

      // Update AP values
      changed.system.attributePoints = changed.system.attributePoints || {};
      changed.system.attributePoints.max = newMaxAP;
      changed.system.attributePoints.current = newMaxAP - totalAllocated;
    }
  }

  prepareDaemonData() {
    try {
      const data = this.system;
      // Access daemon-specific fields
      // data.archetypes, data.special, etc.

      // Filter items to only show special abilities that daemons can use
      const specialAbilities = this.items.filter(
        (item) => item.type === 'special'
      );
    } catch (error) {
      console.error('Error in prepareDaemonData:', error);
    }
  }

  prepareAttributeData() {
    try {
      const data = this.system;

      // Initialize attribute points if not set
      if (!data.attributePoints) {
        data.attributePoints = {
          current: 8,
          max: 8,
          spent: 0,
          allocated: { pow: 0, dex: 0, will: 0, sta: 0 },
        };
      }

      // Calculate max AP based on level (8 base + 2 per level)
      const level = data.level || 1;
      const maxAP = 8 + (level - 1) * 2;
      data.attributePoints.max = maxAP;

      // Calculate allocated points based on current base values vs starting value (3)
      if (data.attributes) {
        let totalAllocated = 0;
        for (const [attrKey, attr] of Object.entries(data.attributes)) {
          const currentBase = attr.base || 3;
          const allocated = Math.max(0, currentBase - 3); // Points above starting value of 3
          data.attributePoints.allocated[attrKey] = allocated;
          totalAllocated += allocated;

          // Calculate effective value and tick
          const effectiveValue = currentBase + (attr.mod || 0);
          attr.effective = effectiveValue;
          attr.tick = Math.floor(effectiveValue / 5);
        }

        // Update spent and current
        data.attributePoints.spent = totalAllocated;
        data.attributePoints.current = maxAP - totalAllocated;
      }

      // Debug logging
      console.log('Attribute Points Data:', data.attributePoints);
    } catch (error) {
      console.error('Error in prepareAttributeData:', error);
    }
  }

  prepareSummonerData() {
    try {
      const data = this.system;

      // Access summoner-specific fields
      // data.skills, data.dejection, data.bonds, etc.

      // Summoners cannot have special abilities
      const availableItems = this.items.filter(
        (item) => item.type !== 'special'
      );

      // Auto-initialize core skills if they don't exist
      const coreSkills = globalThis.DASU?.CORE_SKILLS || [
        { id: 'athletics', name: 'Athletics', govern: 'pow' },
        { id: 'academia', name: 'Academia', govern: 'will' },
        { id: 'craftsmanship', name: 'Craftsmanship', govern: 'dex' },
        { id: 'intuition', name: 'Intuition', govern: 'will' },
        { id: 'medicine', name: 'Medicine', govern: 'will' },
        { id: 'perceiving', name: 'Perceiving', govern: 'will' },
        { id: 'stealth', name: 'Stealth', govern: 'dex' },
        { id: 'outdoorsmanship', name: 'Outdoorsmanship', govern: 'sta' },
      ];

      const hasAllCoreSkills = coreSkills.every((coreSkill) =>
        this.system.skills?.some((skill) => skill.id === coreSkill.id)
      );

      if (!hasAllCoreSkills) {
        // Use a hook to initialize after the actor is fully prepared
        Hooks.once('ready', () => {
          this.initializeCoreSkills();
        });
      }
    } catch (error) {
      console.error('Error in prepareSummonerData:', error);
    }
  }

  /**
   * Initialize core skills if they don't exist (Summoner only)
   */
  async initializeCoreSkills() {
    if (this.type !== 'summoner') return;

    const currentSkills = this.system.skills || [];
    const existingSkillIds = new Set(currentSkills.map((skill) => skill.id));

    const skillsToAdd = [];

    // Add any missing core skills
    const coreSkills = globalThis.DASU?.CORE_SKILLS || [
      { id: 'athletics', name: 'Athletics', govern: 'pow' },
      { id: 'academia', name: 'Academia', govern: 'will' },
      { id: 'craftsmanship', name: 'Craftsmanship', govern: 'dex' },
      { id: 'intuition', name: 'Intuition', govern: 'will' },
      { id: 'medicine', name: 'Medicine', govern: 'will' },
      { id: 'perceiving', name: 'Perceiving', govern: 'will' },
      { id: 'stealth', name: 'Stealth', govern: 'dex' },
      { id: 'outdoorsmanship', name: 'Outdoorsmanship', govern: 'sta' },
    ];

    for (const coreSkill of coreSkills) {
      if (!existingSkillIds.has(coreSkill.id)) {
        skillsToAdd.push({
          id: coreSkill.id,
          name: coreSkill.name,
          govern: coreSkill.govern,
          base: 0,
          mod: 0,
          ticks: 0,
          specialties: '',
          isCore: true,
        });
      }
    }

    if (skillsToAdd.length > 0) {
      const updatedSkills = [...currentSkills, ...skillsToAdd];
      await this.update({ 'system.skills': updatedSkills });
    }
  }

  /**
   * Get all skills (Summoner only)
   * @returns {Array} Array of all skills
   */
  getAllSkills() {
    if (this.type !== 'summoner') return [];
    return this.system.skills || [];
  }

  /**
   * Get skills organized by type (Summoner only)
   * @returns {Object} Object with coreSkills and customSkills arrays
   */
  getSkillsByType() {
    if (this.type !== 'summoner') return { coreSkills: [], customSkills: [] };

    const allSkills = this.getAllSkills();
    const coreSkills = allSkills.filter((skill) => skill.isCore);
    const customSkills = allSkills.filter((skill) => !skill.isCore);

    return { coreSkills, customSkills };
  }

  /**
   * Add a new custom skill (Summoner only)
   * @param {Object} skillData - Skill data object
   */
  async addCustomSkill(skillData) {
    if (this.type !== 'summoner') return null;

    const currentSkills = [...(this.system.skills || [])];

    // Generate unique ID if not provided
    const skillId = skillData.id || `custom_${foundry.utils.randomID()}`;

    // Validate skill data
    const newSkill = {
      id: skillId,
      name: skillData.name || 'New Skill',
      govern: skillData.govern || 'will',
      base: Math.max(0, Math.min(10, skillData.base || 0)),
      mod: skillData.mod || 0,
      ticks: skillData.ticks || 0,
      specialties: skillData.specialties || '',
      isCore: false,
    };

    currentSkills.push(newSkill);

    await this.update({
      'system.skills': currentSkills,
    });

    return newSkill;
  }

  /**
   * Remove a skill by ID (Summoner only)
   * @param {string} skillId - ID of the skill to remove
   */
  async removeSkill(skillId) {
    if (this.type !== 'summoner') return false;

    const currentSkills = this.system.skills || [];
    const skill = currentSkills.find((s) => s.id === skillId);

    // Don't allow removing core skills
    if (skill && skill.isCore) {
      ui.notifications.warn('Cannot remove core skills');
      return false;
    }

    const updatedSkills = currentSkills.filter((s) => s.id !== skillId);

    await this.update({
      'system.skills': updatedSkills,
    });

    return true;
  }

  /**
   * Update a skill by ID (Summoner only)
   * @param {string} skillId - ID of the skill to update
   * @param {Object} updates - Partial skill data to update
   */
  async updateSkill(skillId, updates) {
    if (this.type !== 'summoner') return false;

    const currentSkills = [...(this.system.skills || [])];
    const skillIndex = currentSkills.findIndex((s) => s.id === skillId);

    if (skillIndex === -1) {
      console.warn(`Skill with ID ${skillId} not found`);
      return false;
    }

    // Don't allow changing core skill IDs or isCore flag
    const skill = currentSkills[skillIndex];
    if (skill.isCore) {
      delete updates.id;
      delete updates.isCore;
    }

    currentSkills[skillIndex] = {
      ...skill,
      ...updates,
    };

    await this.update({
      'system.skills': currentSkills,
    });

    return true;
  }

  /**
   * Get a specific skill by ID (Summoner only)
   * @param {string} skillId - The skill ID to retrieve
   * @returns {Object|null} The skill object or null if not found
   */
  getSkill(skillId) {
    if (this.type !== 'summoner') return null;

    const skills = this.getAllSkills();
    return skills.find((skill) => skill.id === skillId) || null;
  }

  /**
   * Get a skill by name (case-insensitive) (Summoner only)
   * @param {string} skillName - The skill name to retrieve
   * @returns {Object|null} The skill object or null if not found
   */
  getSkillByName(skillName) {
    if (this.type !== 'summoner') return null;

    const skills = this.getAllSkills();
    return (
      skills.find(
        (skill) => skill.name.toLowerCase() === skillName.toLowerCase()
      ) || null
    );
  }

  /**
   * Calculate total skill value (base + governing attribute + mod) (Summoner only)
   * @param {string} skillId - The skill ID to calculate
   * @returns {number} Total skill value
   */
  getSkillTotal(skillId) {
    if (this.type !== 'summoner') return 0;

    const skill = this.getSkill(skillId);
    if (!skill) return 0;

    const governingAttr = this.system.attributes[skill.govern];
    const attrTotal = (governingAttr?.base || 0) + (governingAttr?.mod || 0);

    return skill.base + attrTotal + skill.mod;
  }

  /**
   * Allocate attribute points to an attribute (Daemon and Summoner only)
   * @param {string} attribute - The attribute to allocate points to ('pow', 'dex', 'will', 'sta')
   * @param {number} points - Number of points to allocate
   * @returns {boolean} Success status
   */
  async allocateAttributePoints(attribute, points) {
    if (!['daemon', 'summoner'].includes(this.type)) return false;
    if (!['pow', 'dex', 'will', 'sta'].includes(attribute)) return false;

    const currentPoints = this.system.attributePoints.current;
    if (currentPoints < points) {
      ui.notifications.warn('Not enough attribute points available');
      return false;
    }

    const currentBase = this.system.attributes[attribute].base || 3;
    const newBase = currentBase + points;

    if (newBase > 30) {
      ui.notifications.warn('Cannot exceed maximum attribute value of 30');
      return false;
    }

    const updates = {
      [`system.attributes.${attribute}.base`]: newBase,
    };

    await this.update(updates);
    return true;
  }

  /**
   * Remove attribute points from an attribute (Daemon and Summoner only)
   * @param {string} attribute - The attribute to remove points from ('pow', 'dex', 'will', 'sta')
   * @param {number} points - Number of points to remove
   * @returns {boolean} Success status
   */
  async removeAttributePoints(attribute, points) {
    if (!['daemon', 'summoner'].includes(this.type)) return false;
    if (!['pow', 'dex', 'will', 'sta'].includes(attribute)) return false;

    const currentBase = this.system.attributes[attribute].base || 3;
    const newBase = currentBase - points;

    if (newBase < 3) {
      ui.notifications.warn('Cannot go below minimum attribute value of 3');
      return false;
    }

    const updates = {
      [`system.attributes.${attribute}.base`]: newBase,
    };

    await this.update(updates);
    return true;
  }

  /**
   * Level up the actor, adding 2 attribute points (Daemon and Summoner only)
   * @returns {boolean} Success status
   */
  async levelUp() {
    if (!['daemon', 'summoner'].includes(this.type)) return false;

    const newLevel = this.system.level + 1;
    const newMaxPoints = 8 + (newLevel - 1) * 2;

    const updates = {
      'system.level': newLevel,
      'system.attributePoints.max': newMaxPoints,
    };

    await this.update(updates);
    ui.notifications.info(
      `Leveled up to ${newLevel}! Gained 2 attribute points.`
    );
    return true;
  }

  /**
   * Get available attribute points (Daemon and Summoner only)
   * @returns {number} Available attribute points
   */
  getAvailableAttributePoints() {
    if (!['daemon', 'summoner'].includes(this.type)) return 0;
    return this.system.attributePoints.current || 0;
  }

  /**
   * Get total allocated attribute points (Daemon and Summoner only)
   * @returns {number} Total allocated points
   */
  getTotalAllocatedAttributePoints() {
    if (!['daemon', 'summoner'].includes(this.type)) return 0;
    const allocated = this.system.attributePoints.allocated || {
      pow: 0,
      dex: 0,
      will: 0,
      sta: 0,
    };
    return allocated.pow + allocated.dex + allocated.will + allocated.sta;
  }

  /**
   * Get attribute tick value (Daemon and Summoner only)
   * @param {string} attribute - The attribute to get tick for ('pow', 'dex', 'will', 'sta')
   * @returns {number} Tick value
   */
  getAttributeTick(attribute) {
    if (!['daemon', 'summoner'].includes(this.type)) return 0;
    if (!['pow', 'dex', 'will', 'sta'].includes(attribute)) return 0;

    const attr = this.system.attributes[attribute];
    if (!attr) return 0;

    const effectiveValue = (attr.base || 3) + (attr.mod || 0);
    return Math.floor(effectiveValue / 5);
  }

  /**
   * Get all skills with their calculated totals (Summoner only)
   * @returns {Array} Array of skills with total values
   */
  getSkillsWithTotals() {
    if (this.type !== 'summoner') return [];

    return this.getAllSkills().map((skill) => ({
      ...skill,
      total: this.getSkillTotal(skill.id),
    }));
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

  /**
   * Force recalculation of AP based on current level and attributes
   * @returns {Promise<void>}
   */
  async recalculateAP() {
    if (!['daemon', 'summoner'].includes(this.type)) return;

    const level = this.system.level || 1;
    const maxAP = 8 + (level - 1) * 2;

    let totalAllocated = 0;
    if (this.system.attributes) {
      for (const [attrKey, attr] of Object.entries(this.system.attributes)) {
        const currentBase = attr.base || 3;
        const allocated = Math.max(0, currentBase - 3);
        totalAllocated += allocated;
      }
    }

    const updates = {
      'system.attributePoints.max': maxAP,
      'system.attributePoints.current': maxAP - totalAllocated,
      'system.attributePoints.spent': totalAllocated,
    };

    await this.update(updates);
  }
}
