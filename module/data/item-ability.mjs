import BaseItemDataModel from './item-base.mjs';

export default class AbilityDataModel extends BaseItemDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    const baseSchema = super.defineSchema();

    // Fallback ability categories in case DASU is not available yet
    const abilityCategories = globalThis.DASU?.ABILITY_CATEGORIES || [
      'spell',
      'affliction',
      'restorative',
      'technique',
    ];

    return {
      ...baseSchema,
      category: new fields.StringField({
        required: true, // Required for abilities since they need subcategorization
        choices: abilityCategories,
        initial: 'spell', // Set initial value to prevent validation error
      }),
      // Common ability fields
      damage: new fields.SchemaField({
        value: new fields.NumberField({ required: true, initial: 0 }),
        type: new fields.StringField({
          required: true,
          choices: [
            'physical',
            'fire',
            'ice',
            'electric',
            'wind',
            'earth',
            'light',
            'dark',
            'untyped',
          ],
          initial: 'physical',
        }),
      }),
      cost: new fields.NumberField({ required: true, initial: 0 }),
      costType: new fields.StringField({
        required: true,
        choices: ['wp', 'hp'],
        initial: 'wp',
      }),
      toHit: new fields.NumberField({ required: true, initial: 0 }),
      aptitudes: new fields.SchemaField({
        type: new fields.StringField({ required: true, initial: 'f' }),
        value: new fields.NumberField({ required: true, initial: 0 }),
      }),

      // Technique-specific fields

      // Spell-specific fields

      // Restorative-specific fields
      healed: new fields.SchemaField({
        type: new fields.StringField({
          required: false,
          choices: ['hp', 'wp', 'both', 'status'],
          initial: 'hp',
        }),
        value: new fields.NumberField({ required: false, initial: 0 }),
      }),

      // Affliction-specific fields
      isInfinity: new fields.BooleanField({ required: false, initial: false }),
    };
  }

  prepareDerivedData() {
    super.prepareDerivedData();

    // Ensure damage.value is a single number, not an array
    if (Array.isArray(this.damage?.value)) {
      this.damage.value = this.damage.value[1] || 0;
    }

    // Ensure cost is a single number, not an array
    if (Array.isArray(this.cost)) {
      this.cost = this.cost[1] || 0;
    }

    // Ensure toHit is a single number, not an array
    if (Array.isArray(this.toHit)) {
      this.toHit = this.toHit[1] || 0;
    }

    // Ensure spellLevel is a single number, not an array
    if (Array.isArray(this.spellLevel)) {
      this.spellLevel = this.spellLevel[1] || 0;
    }

    // Ensure aptitudes.value is a single number, not an array
    if (Array.isArray(this.aptitudes?.value)) {
      this.aptitudes.value = this.aptitudes.value[1] || 0;
    }
  }
}
