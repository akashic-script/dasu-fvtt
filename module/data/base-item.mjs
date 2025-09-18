export default class DASUItemBase extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ['DASU.Item.base'];

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};

    // DASU System fields
    schema.dsid = new fields.StringField({ required: true, blank: false });
    schema.category = new fields.StringField({
      required: false,
      choices:
        foundry.utils.getProperty(globalThis, 'DASU.ABILITY_CATEGORIES') || [],
    });
    schema.description = new fields.StringField({ required: false });
    // Add traits array for all items
    schema.traits = new fields.ArrayField(new fields.StringField(), {
      required: false,
      initial: [],
    });
    // Add favorite field for all items
    schema.favorite = new fields.BooleanField({
      required: false,
      initial: false,
    });

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
