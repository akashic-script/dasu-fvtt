import { ABILITY_CATEGORIES } from '../helpers/config.mjs';

export default class DASUItemBase extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ['DASU.Item.base'];

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};

    // DASU System fields
    schema.dsid = new fields.StringField({ required: true, blank: false });
    schema.category = new fields.StringField({
      required: false, // Optional since not all item types need categories
      choices: ABILITY_CATEGORIES,
    });
    schema.description = new fields.StringField({ required: false });

    return schema;
  }

  prepareDerivedData() {
    super.prepareDerivedData();

    // Ensure description is a single string, not an array
    if (Array.isArray(this.description)) {
      this.description = this.description[1] || '';
    }
  }
}
