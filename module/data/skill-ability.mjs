import DASUItemBase from './item-base.mjs';

/**
 * A Skill Ability: an action performed alongside a skill check (e.g. Identify,
 * Heal, Ambush). Resolves the linked skill against a Difficulty Threshold which
 * is either the target's Avoid/Defense or a fixed TN.
 */
export default class DASUSkillAbility extends DASUItemBase {
  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    // Which skill this ability rolls. Choices are filled at runtime from config
    // so custom skills are excluded; blank means "GM/player picks at roll time".
    schema.skill = new fields.StringField({ required: true, blank: true, initial: '' });

    // How the Difficulty Threshold is derived when targeting an opponent.
    schema.thresholdType = new fields.StringField({
      required: true,
      blank: false,
      initial: 'avoid',
      choices: {
        avoid: 'DASU.SkillAbility.Threshold.Avoid',
        defense: 'DASU.SkillAbility.Threshold.Defense',
        fixed: 'DASU.SkillAbility.Threshold.Fixed',
      },
    });

    // Used only when thresholdType === 'fixed' (e.g. Craft basic weapon, TN 14).
    schema.fixedTN = new fields.NumberField({
      required: true,
      integer: true,
      initial: 0,
      min: 0,
    });

    // Most skill abilities cost the main action; a rule may say otherwise.
    schema.costsMainAction = new fields.BooleanField({ initial: true });

    return schema;
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    this.skillLabel = this.#resolveSkillLabel();
  }

  /** Core skills resolve from config; custom skills from the owning actor. */
  #resolveSkillLabel() {
    if (!this.skill) return '';
    const i18nKey = CONFIG.DASU.skills?.[this.skill];
    if (i18nKey) return game.i18n.localize(i18nKey);
    const actor = this.parent?.parent;
    if (actor instanceof Actor) {
      const s = actor.system?.skills?.[this.skill];
      if (s) return s.customName?.trim() || s.label || this.skill;
    }
    return this.skill;
  }
}
