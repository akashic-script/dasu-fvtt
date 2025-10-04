/**
 * @fileoverview DASU Active Effect Data Model
 * Defines custom flags for stackable effects and related properties
 */

const { fields } = foundry.data;

/**
 * Data model for DASU Active Effect custom flags
 * @extends foundry.abstract.DataModel
 */
export class DASUActiveEffectData extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      stackable: new fields.BooleanField({
        required: true,
        initial: false,
        label: 'DASU.Effect.Stackable',
        hint: 'DASU.Effect.StackableHint',
      }),
      stackId: new fields.StringField({
        required: false,
        blank: true,
        nullable: true,
        label: 'DASU.Effect.StackId',
        hint: 'DASU.Effect.StackIdHint',
      }),
      maxStacks: new fields.NumberField({
        required: false,
        initial: null,
        min: 1,
        integer: true,
        nullable: true,
        label: 'DASU.Effect.MaxStacks',
        hint: 'DASU.Effect.MaxStacksHint',
      }),
      currentStacks: new fields.NumberField({
        required: true,
        initial: 1,
        min: 0,
        integer: true,
        label: 'DASU.Effect.CurrentStacks',
        hint: 'DASU.Effect.CurrentStacksHint',
      }),
      stackMode: new fields.StringField({
        required: true,
        initial: 'ADD',
        choices: {
          ADD: 'DASU.Effect.StackMode.Add',
          MULTIPLY: 'DASU.Effect.StackMode.Multiply',
          MAX: 'DASU.Effect.StackMode.Max',
          MIN: 'DASU.Effect.StackMode.Min',
        },
        label: 'DASU.Effect.StackMode',
        hint: 'DASU.Effect.StackModeHint',
      }),
      showStackCount: new fields.BooleanField({
        required: true,
        initial: true,
        label: 'DASU.Effect.ShowStackCount',
        hint: 'DASU.Effect.ShowStackCountHint',
      }),
    };
  }
}
