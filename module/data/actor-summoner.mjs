import BaseActorDataModel from './base-actor.mjs';

export default class SummonerDataModel extends BaseActorDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    const baseSchema = super.defineSchema();

    const skillSchema = new fields.SchemaField({
      name: new fields.StringField({ required: true, initial: '' }),
      govern: new fields.StringField({
        required: true,
        choices: ['pow', 'dex', 'will', 'sta'],
        initial: 'pow',
      }),
      base: new fields.NumberField({
        required: true,
        initial: 0,
        min: 0,
        max: 10,
      }),
      mod: new fields.NumberField({ required: true, initial: 0 }),
      ticks: new fields.NumberField({
        required: true,
        initial: 0,
        min: 0,
        max: 6,
      }),
      specialties: new fields.StringField({ required: false, initial: '' }),
      isCore: new fields.BooleanField({ required: false, initial: false }),
      id: new fields.StringField({ required: true, initial: '' }),
    });

    const createStatSchema = () =>
      new fields.SchemaField({
        current: new fields.NumberField({ required: true, initial: 0, min: 0 }),
        spent: new fields.NumberField({ required: true, initial: 0, min: 0 }),
      });

    return {
      ...baseSchema,
      skills: new fields.ArrayField(skillSchema, { required: false }),
      dejection: new fields.SchemaField(
        {
          level: new fields.NumberField({
            required: true,
            initial: 0,
            min: 0,
            max: 15,
          }),
          dejections: new fields.ArrayField(
            new fields.SchemaField({
              description: new fields.StringField({ required: false }),
              wp: new fields.NumberField({
                required: false,
                initial: 0,
                min: 0,
                max: 100,
              }),
              crit: new fields.NumberField({
                required: false,
                initial: 0,
                min: 0,
                max: 100,
              }),
              hasScar: new fields.BooleanField({
                required: false,
                initial: false,
              }),
              scarId: new fields.StringField({ required: false }), // Reference to scar item
            }),
            { required: false }
          ),
        },
        { required: false }
      ),
      bonds: new fields.ArrayField(
        new fields.SchemaField({
          name: new fields.StringField({ required: true, initial: '' }),
          currentAffinity: new fields.NumberField({
            required: true,
            initial: 0,
            min: 0,
            max: 10,
          }),
          description: new fields.ArrayField(
            new fields.SchemaField({
              affinity: new fields.NumberField({
                required: true,
                min: 0,
                max: 10,
                initial: 0,
              }),
              description: new fields.ArrayField(new fields.StringField(), {
                required: false,
              }),
            }),
            { required: false }
          ),
        }),
        { required: false }
      ),
      stocks: new fields.ArrayField(
        new fields.SchemaField({
          references: new fields.SchemaField({
            actor: new fields.StringField({ required: false }),
            isSummoned: new fields.BooleanField({
              required: false,
              initial: false,
            }),
          }),
        }),
        { required: false }
      ),
      // Leveling progression data - stores planned items for future levels
      levelingData: new fields.SchemaField(
        {
          schemas: new fields.SchemaField(
            {
              first: new fields.StringField({ required: false, initial: '' }), // UUID of first schema from compendium
              second: new fields.StringField({ required: false, initial: '' }), // UUID of second schema from compendium
            },
            { required: false, initial: { first: '', second: '' } }
          ),
          abilities: new fields.ObjectField({ required: false, initial: {} }), // Level -> UUID mapping for abilities
          strengthOfWill: new fields.ObjectField({
            required: false,
            initial: {},
          }), // Level -> UUID mapping for features
          // Add storedItems for trait-based leveling item system
          storedItems: new fields.ObjectField({ required: false, initial: {} }), // Level -> [itemData, ...]
          fullItems: new fields.ObjectField({ required: false, initial: {} }), // Slot key -> full item data
        },
        {
          required: false,
          initial: {
            schemas: { first: '', second: '' },
            abilities: {},
            strengthOfWill: {},
            storedItems: {},
            fullItems: {},
          },
        }
      ),
      hp: createStatSchema(),
      wp: createStatSchema(),
      avoid: createStatSchema(),
    };
  }

  /**
   * Initialize default skills for new summoners
   */
  static getDefaultSkills() {
    const coreSkills = globalThis.DASU?.CORE_SKILLS || [];
    return coreSkills.map((skill) => ({
      ...skill,
      base: 0,
      mod: 0,
      ticks: 0,
      isCore: true,
    }));
  }

  /**
   * Calculate skill points based on level
   * @param {number} level - The actor's level
   * @returns {number} - Maximum skill points available
   */
  static calculateSkillPoints(level) {
    // 6 at creation, +2 per level up (max level 30)
    return 6 + Math.max(0, (level - 1) * 2);
  }

  /**
   * Calculate spent skill points based on skill ticks
   * @param {Array} skills - Array of skill objects
   * @returns {number} - Total skill points spent
   */
  static calculateSpentSkillPoints(skills) {
    return skills.reduce((total, skill) => {
      const ticks = skill.ticks || 0;
      // Linear cost: 1+2+...+ticks
      let cost = 0;
      for (let i = 1; i <= ticks; i++) {
        cost += i;
      }
      return total + cost;
    }, 0);
  }

  /**
   * Get skill points data (calculated dynamically)
   * @param {number} level - The actor's level
   * @param {Array} skills - Array of skill objects
   * @returns {Object} - Object with max, spent, and current skill points
   */
  static getSkillPointsData(level, skills) {
    const max = this.calculateSkillPoints(level);
    const spent = this.calculateSpentSkillPoints(skills);
    const current = Math.max(0, max - spent);

    return {
      max,
      spent,
      current,
    };
  }

  /**
   * Get all skills
   * @returns {Array} Array of all skills
   */
  getAllSkills() {
    return this.skills || [];
  }

  /**
   * Get skills organized by type
   * @returns {Object} Object with coreSkills and customSkills arrays
   */
  getSkillsByType() {
    const allSkills = this.getAllSkills();
    const coreSkills = allSkills.filter((skill) => skill.isCore);
    const customSkills = allSkills.filter((skill) => !skill.isCore);

    return { coreSkills, customSkills };
  }

  /**
   * Add a new custom skill
   * @param {Object} skillData - Skill data object
   * @returns {Object|null} The new skill or null if failed
   */
  addCustomSkill(skillData) {
    const currentSkills = [...(this.skills || [])];

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
    this.skills = currentSkills;

    return newSkill;
  }

  /**
   * Remove a skill by ID
   * @param {string} skillId - ID of the skill to remove
   * @returns {boolean} Success status
   */
  removeSkill(skillId) {
    const currentSkills = this.skills || [];
    const skill = currentSkills.find((s) => s.id === skillId);

    // Don't allow removing core skills
    if (skill && skill.isCore) {
      ui.notifications.warn('Cannot remove core skills');
      return false;
    }

    this.skills = currentSkills.filter((s) => s.id !== skillId);
    return true;
  }

  /**
   * Update a skill by ID
   * @param {string} skillId - ID of the skill to update
   * @param {Object} updates - Partial skill data to update
   * @returns {boolean} Success status
   */
  updateSkill(skillId, updates) {
    const currentSkills = [...(this.skills || [])];
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

    this.skills = currentSkills;
    return true;
  }

  /**
   * Get a specific skill by ID
   * @param {string} skillId - The skill ID to retrieve
   * @returns {Object|null} The skill object or null if not found
   */
  getSkill(skillId) {
    const skills = this.getAllSkills();
    return skills.find((skill) => skill.id === skillId) || null;
  }

  /**
   * Get a skill by name (case-insensitive)
   * @param {string} skillName - The skill name to retrieve
   * @returns {Object|null} The skill object or null if not found
   */
  getSkillByName(skillName) {
    const skills = this.getAllSkills();
    return (
      skills.find(
        (skill) => skill.name.toLowerCase() === skillName.toLowerCase()
      ) || null
    );
  }

  /**
   * Calculate total skill value (base + governing attribute + mod)
   * @param {string} skillId - The skill ID to calculate
   * @param {Object} attributes - Actor's attributes object
   * @returns {number} Total skill value
   */
  getSkillTotal(skillId, attributes) {
    const skill = this.getSkill(skillId);
    if (!skill) return 0;

    const governingAttr = attributes[skill.govern];
    const attrTotal = (governingAttr?.base || 0) + (governingAttr?.mod || 0);

    return skill.base + attrTotal + skill.mod;
  }

  /**
   * Get all skills with their calculated totals
   * @param {Object} attributes - Actor's attributes object
   * @returns {Array} Array of skills with total values
   */
  getSkillsWithTotals(attributes) {
    return this.getAllSkills().map((skill) => ({
      ...skill,
      total: this.getSkillTotal(skill.id, attributes),
    }));
  }

  /**
   * Initialize core skills if they don't exist
   * @returns {Array} Array of skills that were added
   */
  initializeCoreSkills() {
    const currentSkills = this.skills || [];
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
      this.skills = [...currentSkills, ...skillsToAdd];
    }

    return skillsToAdd;
  }

  /**
   * Prepare summoner-specific data
   * @param {Array} items - Actor's items for filtering
   */
  prepareSummonerData(items = []) {
    // Summoners cannot have special abilities
    const availableItems = items.filter((item) => item.type !== 'special');

    // Check if core skills need initialization
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
      this.skills?.some((skill) => skill.id === coreSkill.id)
    );

    return {
      availableItems,
      needsCoreSkillInit: !hasAllCoreSkills,
      coreSkills,
    };
  }
}
