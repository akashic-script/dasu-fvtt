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
      // Class integration
      classType: new fields.StringField({
        required: false,
        initial: '',
        label: 'Class',
      }),
      classData: new fields.ObjectField({
        required: false,
        initial: {},
        label: 'Class Data Cache',
      }),
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
          feature: new fields.ObjectField({
            required: false,
            initial: {},
          }), // Level -> UUID mapping for features
          // Add storedItems for trait-based leveling item system
          storedItems: new fields.ObjectField({ required: false, initial: {} }), // Level -> [itemData, ...]
          fullItems: new fields.ObjectField({ required: false, initial: {} }), // Slot key -> full item data
          // Class-based level bonuses
          classBonuses: new fields.ObjectField({
            required: false,
            initial: {},
          }), // Level -> applied bonuses
          // Point allocations for AP/SP per level
          pointAllocations: new fields.ObjectField({
            required: false,
            initial: {},
          }), // Level -> {ap: {pow:1, dex:0...}, sp: {skills: {academia: 2...}}}
        },
        {
          required: false,
          initial: {
            schemas: { first: '', second: '' },
            abilities: {},
            feature: {},
            storedItems: {},
            fullItems: {},
            classBonuses: {},
            pointAllocations: {},
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
    // 4 at creation, +2 per level up (max level 30)
    return 4 + Math.max(0, (level - 1) * 2);
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
   * Get the class data for this summoner
   * @returns {Object|null} - The class data object or null if no class
   */
  getClassData() {
    return this.classData || null;
  }

  /**
   * Set class data for this summoner
   * @param {Object} classData - The class data to set
   */
  setClassData(classData) {
    this.classType = classData.id || '';
    this.classData = classData;
  }

  /**
   * Calculate attribute points based on class and level
   * @param {number} level - The character level
   * @returns {Object} - Object with earned, spent, and unspent AP
   */
  calculateAttributePoints(level) {
    const classData = this.getClassData();
    let earned = 0;

    if (classData?.progression?.apFormula) {
      // Use class formula to calculate earned AP
      for (let i = 1; i <= level; i++) {
        earned += this.evaluateClassFormula(classData.progression.apFormula, i);
      }
    } else {
      // Fallback to default formula (odd levels 1-29)
      for (let i = 1; i <= level; i++) {
        if (i % 2 === 1 && i <= 29) {
          earned += 1;
        }
      }
    }

    // Calculate spent points from attributes
    const attributes = this.parent?.system?.attributes || {};
    const startingAttributes = classData?.startingAttributes || {
      pow: 1,
      dex: 1,
      will: 1,
      sta: 1,
    };

    let spent = 0;
    for (const [attr, value] of Object.entries(attributes)) {
      const currentTick = value?.tick || 1;
      const startingTick = startingAttributes[attr] || 1;
      spent += Math.max(0, currentTick - startingTick);
    }

    return {
      earned,
      spent,
      unspent: Math.max(0, earned - spent),
    };
  }

  /**
   * Calculate skill points based on class and level
   * @param {number} level - The character level
   * @returns {Object} - Object with earned, spent, and unspent SP
   */
  calculateSkillPointsFromClass(level) {
    const classData = this.getClassData();
    let earned = 0;

    if (classData?.progression?.spFormula) {
      // Use class formula to calculate earned SP
      for (let i = 1; i <= level; i++) {
        earned += this.evaluateClassFormula(classData.progression.spFormula, i);
      }
    } else {
      // Fallback to default formula (2 + 2 * level)
      earned = 2 + level * 2;
    }

    const spent = this.constructor.calculateSpentSkillPoints(this.skills || []);

    return {
      earned,
      spent,
      unspent: Math.max(0, earned - spent),
    };
  }

  /**
   * Evaluate a class progression formula
   * @param {string} formula - The formula to evaluate
   * @param {number} level - The character level
   * @returns {number} - The calculated value
   */
  evaluateClassFormula(formula, level) {
    try {
      // Handle special formula formats
      if (formula.includes('odd:')) {
        const match = formula.match(/odd:(\d+)-(\d+)/);
        if (match) {
          const start = parseInt(match[1]);
          const end = parseInt(match[2]);
          return level >= start && level <= end && level % 2 === 1 ? 1 : 0;
        }
      }

      if (formula.includes('even:')) {
        const match = formula.match(/even:(\d+)-(\d+)/);
        if (match) {
          const start = parseInt(match[1]);
          const end = parseInt(match[2]);
          return level >= start && level <= end && level % 2 === 0 ? 1 : 0;
        }
      }

      // Replace 'level' with actual level value
      const expression = formula.replace(/level/g, level.toString());

      // Simple evaluation for basic mathematical expressions
      if (!/^[\d+\-*/()s.]+$/.test(expression)) {
        console.warn(`Invalid class formula: ${formula}`);
        return 0;
      }

      return Math.floor(eval(expression)) || 0;
    } catch (error) {
      console.warn(
        `Error evaluating class formula "${formula}" for level ${level}:`,
        error
      );
      return 0;
    }
  }

  /**
   * Get level bonuses from class for a specific level
   * @param {number} level - The character level
   * @returns {Array} - Array of level bonuses for that level
   */
  getClassBonusesForLevel(level) {
    const classData = this.getClassData();
    if (!classData?.levelBonuses) return [];

    const bonuses = [];
    for (const bonus of classData.levelBonuses) {
      const levels = Array.isArray(bonus.level) ? bonus.level : [bonus.level];
      if (levels.includes(level)) {
        bonuses.push(bonus);
      }
    }

    return bonuses;
  }

  /**
   * Check if a schema is allowed by the current class
   * @param {string} schemaId - The schema ID to check
   * @returns {boolean} - Whether the schema is allowed
   */
  isSchemaAllowedByClass(schemaId) {
    const classData = this.getClassData();
    if (!classData?.restrictions) return true;

    const { allowedSchemas, forbiddenSchemas } = classData.restrictions;

    // If specific schemas are allowed, check against that list
    if (allowedSchemas && allowedSchemas.length > 0) {
      return allowedSchemas.includes(schemaId);
    }

    // If no specific allow list, check forbidden list
    if (forbiddenSchemas && forbiddenSchemas.length > 0) {
      return !forbiddenSchemas.includes(schemaId);
    }

    // If no restrictions, allow all schemas
    return true;
  }

  /**
   * Get schema progression from class bonuses
   * @param {number} level - The character level
   * @returns {Object} - Schema progression info by slot
   */
  getSchemaProgressionFromClass(level) {
    const classData = this.getClassData();
    if (!classData?.levelBonuses) return {};

    const progression = {};

    for (let i = 1; i <= level; i++) {
      const bonuses = this.getClassBonusesForLevel(i);
      const schemaBonuses = bonuses.filter((bonus) => bonus.type === 'schema');

      for (const bonus of schemaBonuses) {
        const slot = bonus.schemaSlot;
        const schemaLevel = bonus.schemaLevel;

        if (slot && schemaLevel) {
          if (!progression[slot]) {
            progression[slot] = { maxLevel: 0, unlockedAt: null };
          }

          if (schemaLevel > progression[slot].maxLevel) {
            progression[slot].maxLevel = schemaLevel;
          }

          if (progression[slot].unlockedAt === null && schemaLevel === 1) {
            progression[slot].unlockedAt = i;
          }
        }
      }
    }

    return progression;
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

  /**
   * Calculate total allocated points from leveling wizard
   * @returns {Object} Total allocated points by attribute and skill
   */
  get calculatedAllocations() {
    const levelingData = this.levelingData || {};
    const pointAllocations = levelingData.pointAllocations || {};

    // Calculate total attribute points allocated
    const attributePoints = { pow: 0, dex: 0, will: 0, sta: 0 };
    const skillPoints = {};

    // Sum up points from all levels
    for (const [level, allocation] of Object.entries(pointAllocations)) {
      const levelNum = parseInt(level);
      if (levelNum <= this.level) {
        // Only apply points for completed levels
        // Add attribute points
        if (allocation.ap) {
          for (const [attr, points] of Object.entries(allocation.ap)) {
            if (attr in attributePoints) {
              attributePoints[attr] += points || 0;
            }
          }
        }

        // Add skill points
        if (allocation.sp?.skills) {
          for (const [skill, points] of Object.entries(allocation.sp.skills)) {
            skillPoints[skill] = (skillPoints[skill] || 0) + (points || 0);
          }
        }
      }
    }

    return { attributePoints, skillPoints };
  }

  /**
   * Get final attribute values including starting values and allocated points
   * @returns {Object} Final attribute values
   */
  get finalAttributes() {
    const allocations = this.calculatedAllocations;
    const classData = this.getClassData();
    const startingAttributes = classData?.startingAttributes || {
      pow: 1,
      dex: 1,
      will: 1,
      sta: 1,
    };

    const result = {};
    for (const attr of ['pow', 'dex', 'will', 'sta']) {
      const starting = startingAttributes[attr] || 1;
      const allocated = allocations.attributePoints[attr] || 0;
      result[attr] = starting + allocated;
    }

    return result;
  }

  /**
   * Prepare derived data after all base data is loaded
   */
  prepareDerivedData() {
    super.prepareDerivedData();

    // Apply calculated allocations to attribute tick values
    const finalAttributes = this.finalAttributes;

    // Update attribute tick values based on calculated allocations
    if (this.attributes) {
      for (const [attr, finalValue] of Object.entries(finalAttributes)) {
        if (this.attributes[attr]) {
          this.attributes[attr].tick = Math.min(6, Math.max(1, finalValue));
        }
      }
    }
  }
}
