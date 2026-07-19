import DASUItemBase from './item-base.mjs';
import { ResourceField } from './fields/index.mjs';
import { TaggableMixin } from './mixins/taggable.mjs';

export default class DASUSpecialAbility extends TaggableMixin(DASUItemBase) {
  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    schema.kind = new fields.StringField({
      required: true,
      blank: false,
      initial: 'passive',
      choices: {
        passive: 'DASU.SpecialAbility.Kind.Passive',
        active: 'DASU.SpecialAbility.Kind.Active',
        reactive: 'DASU.SpecialAbility.Kind.Reactive',
      },
    });

    schema.resource = ResourceField({ defaultType: 'wp' });

    return schema;
  }

  _tagBudget() {
    return Infinity;
  }
}
