export default class EquippedDataModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      weapon: new fields.StringField({ required: false, nullable: true, initial: null }),
    };
  }

  isEquipped(item) {
    return !!this.weapon && this.weapon === item?.id;
  }

}
