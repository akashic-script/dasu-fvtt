export default class BaseItemDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      dsid: new fields.StringField({
        required: false,
        blank: true,
        initial: '',
      }),
      description: new fields.StringField({ required: false, initial: '' }),
      // Add favorite field for all items
      favorite: new fields.BooleanField({
        required: false,
        initial: false,
      }),
    };
  }
}
