export default class DASUItemBase extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};

    schema.description = new fields.StringField({ required: true, blank: true });
    schema.roll = new fields.SchemaField({
      diceNum: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1 }),
      diceSize: new fields.StringField({ required: true, blank: false, initial: "d6" }),
      diceBonus: new fields.StringField({ required: true, blank: true, initial: "" }),
    });

    return schema;
  }

  prepareDerivedData() {
    const r = this.roll;
    const bonus = r.diceBonus ? (r.diceBonus.startsWith("+") || r.diceBonus.startsWith("-") ? r.diceBonus : `+ ${r.diceBonus}`) : "";
    this.formula = `${r.diceNum}${r.diceSize} ${bonus}`.trim();
  }

  prepareBaseData() {
    super.prepareBaseData();
  }
}
