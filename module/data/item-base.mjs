import { PseudoDocumentCollectionField } from './pseudo/pseudo-document-collection-field.mjs';

export default class DASUItemBase extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};

    schema.dsid = new fields.StringField({ required: true, blank: true, initial: '' });
    schema.description = new fields.StringField({ required: true, blank: true });

    return schema;
  }

  _configure(options = {}) {
    super._configure(options);
    const collections = {};
    for (const [fieldName, field] of Object.entries(
      this.constructor.schema.fields
    )) {
      if (field instanceof PseudoDocumentCollectionField) {
        const data = this._source[fieldName];
        const collection = new field.constructor.implementation(
          fieldName,
          this,
          data
        );
        collections[fieldName] = collection;
        Object.defineProperty(this, fieldName, {
          value: collection,
          writable: true,
        });
      }
    }
    Object.defineProperty(this, 'collections', {
      value: Object.seal(collections),
      writable: false,
    });
  }

  _initialize(options = {}) {
    super._initialize(options);
    for (const [fieldName, collection] of Object.entries(this.collections)) {
      collection.updateSource(this._source[fieldName]);
    }
  }

  prepareDerivedData() {
    if (!this.dsid) {
      this.dsid = (this.parent?.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }
  }

  static migrateData(source) {
    if (source.identifier && !source.dsid) source.dsid = source.identifier;
    delete source.identifier;
    return super.migrateData?.(source) ?? source;
  }

  prepareBaseData() {
    super.prepareBaseData();
  }

  static getCollectionName(name) {
    if (name in this.schema.fields) return name;
    for (const [fieldName, field] of Object.entries(this.schema.fields)) {
      if (
        field instanceof PseudoDocumentCollectionField &&
        (field.model.name === name || field.model.documentName === name)
      ) {
        return fieldName;
      }
    }
    return null;
  }

  transferEffects() {
    return true;
  }

  get parentFoundryDocument() {
    let current = this.parent;
    while (current !== null) {
      if (current instanceof foundry.abstract.Document) return current;
      current = current.parent;
    }
    return null;
  }

  getEmbeddedCollection(embeddedName) {
    const collectionName = this.constructor.getCollectionName(embeddedName);
    if (!collectionName) {
      throw new Error(
        `${embeddedName} is not a valid embedded Document within the ${this.constructor.name} Document`
      );
    }
    const field = this.constructor.schema.fields[collectionName];
    return field.getCollection(this);
  }

  getEmbeddedDocument(embeddedName, id, { invalid = false, strict = false } = {}) {
    return this.getEmbeddedCollection(embeddedName).get(id, { invalid, strict });
  }

  async createEmbeddedDocuments(embeddedName, data = [], operation = {}) {
    const collection = this.getEmbeddedCollection(embeddedName);
    operation.parent = this;
    return collection.documentClass.createDocuments(data, operation);
  }

  async updateEmbeddedDocuments(embeddedName, updates = [], operation = {}) {
    const collection = this.getEmbeddedCollection(embeddedName);
    operation.parent = this;
    return collection.documentClass.updateDocuments(updates, operation);
  }

  async deleteEmbeddedDocuments(embeddedName, ids = [], operation = {}) {
    const collection = this.getEmbeddedCollection(embeddedName);
    operation.parent = this;
    return collection.documentClass.deleteDocuments(ids, operation);
  }
}
