// Archetype Data Model for Daemon Summoner system
import BaseItemDataModel from './item-base.mjs';

export default class ArchetypeDataModel extends BaseItemDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return foundry.utils.mergeObject(super.defineSchema(), {
      description: new fields.HTMLField({
        required: false,
        blank: true,
        initial: '',
        label: 'DASU.Item.Description',
      }),
      benefits: new fields.StringField({
        required: false,
        blank: true,
        initial: '',
        label: 'DASU.Item.Archetype.benefits',
      }),
    });
  }
}
