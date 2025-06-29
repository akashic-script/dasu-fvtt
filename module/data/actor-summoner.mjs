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
        max: new fields.NumberField({ required: true, initial: 0, min: 0 }),
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
    return 4 + (level - 1) * 2;
  }

  /**
   * Calculate spent skill points based on skill ticks
   * @param {Array} skills - Array of skill objects
   * @returns {number} - Total skill points spent
   */
  static calculateSpentSkillPoints(skills) {
    return skills.reduce((total, skill) => {
      // Ensure ticks is a valid number, default to 0 if undefined/null
      const ticks = skill.ticks || 0;

      // If ticks is 0, no cost (skills start free)
      if (ticks === 0) {
        return total + 0;
      }

      // Cost increases by 1 for each additional die: 1 + 2 + 3 + 4 + 5 + 6 = 21 SP for 6 ticks
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
}
