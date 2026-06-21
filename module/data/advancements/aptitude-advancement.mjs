import BaseAdvancement from './base-advancement.mjs';

export default class AptitudeAdvancement extends BaseAdvancement {
  static get TYPE() {
    return 'aptitude';
  }

  static LABEL = 'DASU.Item.Class.AptitudeUp';
  static ICON = 'fa-solid fa-arrow-up-right-dots';

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();
    schema.amount = new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 1,
      min: 1,
    });
    return schema;
  }

  getBadges() {
    return [
      {
        label: game.i18n.format('DASU.Planner.AptitudeBadge', {
          n: this.amount,
        }),
        type: 'apt',
      },
    ];
  }

  getExpandData() {
    return { amount: this.amount };
  }

  getPlannerEntries() {
    return [{ kind: 'apt', amount: this.amount }];
  }
}
