import { PseudoDocument } from './pseudo-document.mjs';

export class TypedPseudoDocument extends PseudoDocument {
  static defineSchema() {
    const { StringField } = foundry.data.fields;
    const self = this;
    return Object.assign(super.defineSchema(), {
      type: new StringField({
        required: true,
        blank: false,
        initial: () => self.TYPE || Object.keys(self.TYPES)[0],
        choices: () => Object.keys(self.TYPES),
      }),
    });
  }

  /** @type {string} */
  static get TYPE() {
    return '';
  }

  /** @type {Record<string, typeof TypedPseudoDocument>} */
  static get TYPES() {
    return this.baseDocument._types ?? {};
  }

  static registerType(cls) {
    const base = this.baseDocument;
    if (!Object.prototype.hasOwnProperty.call(base, '_types')) {
      Object.defineProperty(base, '_types', { value: {}, writable: false });
    }
    if (cls.TYPE) base._types[cls.TYPE] = cls;
  }

  static getSubclass(data) {
    return this.TYPES[data?.type] ?? this;
  }

  static get schema() {
    if (Object.prototype.hasOwnProperty.call(this, '_schema')) {
      return this._schema;
    }
    const schema = new foundry.data.fields.SchemaField(
      Object.freeze(this.defineSchema())
    );
    Object.defineProperty(this, '_schema', { value: schema, writable: false });
    return schema;
  }
}
