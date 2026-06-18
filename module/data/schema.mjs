import DASUItemBase from "./item-base.mjs";
import { ResourceField } from "./fields/index.mjs";

export default class DASUSchema extends DASUItemBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    schema.level = new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 1,
      min: 1,
      max: 3,
    });

    schema.level1 = new fields.SchemaField({
      description: new fields.HTMLField({ required: false, initial: '' }),
      resource: ResourceField({ defaultType: 'wp' }),
    });

    schema.level2 = new fields.SchemaField({
      description: new fields.HTMLField({ required: false, initial: '' }),
      resource: ResourceField({ defaultType: 'wp' }),
    });

    schema.level3 = new fields.SchemaField({
      description: new fields.HTMLField({ required: false, initial: '' }),
      resource: ResourceField({ defaultType: 'wp' }),
    });

    return schema;
  }

  prepareDerivedData() {
    super.prepareDerivedData();
  }
}
