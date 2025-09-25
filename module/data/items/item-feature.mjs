// Feature Data Model for Daemon Summoner system
import BaseItemDataModel from './item-base.mjs';

export default class FeatureDataModel extends BaseItemDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return foundry.utils.mergeObject(super.defineSchema(), {
      description: new fields.HTMLField({
        required: false,
        blank: true,
        initial: '',
        label: 'DASU.Item.Description',
      }),
      // Add additional fields specific to Feature if needed
    });
  }
}
