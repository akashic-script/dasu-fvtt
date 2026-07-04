import { PseudoDocumentCollectionField } from './pseudo-document-collection-field.mjs';

export class PseudoDocument extends foundry.abstract.DataModel {
  static defineSchema() {
    const { DocumentIdField, StringField, IntegerSortField } =
      foundry.data.fields;
    return {
      _id: new DocumentIdField({ initial: () => foundry.utils.randomID() }),
      name: new StringField({ required: true, blank: true }),
      sort: new IntegerSortField(),
    };
  }

  _configure({ parentCollection = null } = {}) {
    if (
      this.schema.fields['_id'] &&
      (!Object.getOwnPropertyDescriptor(this, '_id') || this._id === null)
    ) {
      const field = this.schema.fields['_id'];
      const sourceValue = this._source['_id'];
      const value = field.initialize(sourceValue, this, {});
      Object.defineProperty(this, '_id', {
        value,
        writable: true,
        configurable: true,
      });
    }

    Object.defineProperty(this, 'parentCollection', {
      value: this._getParentCollection(parentCollection),
      writable: false,
    });

    const collections = {};
    for (const [fieldName, field] of Object.entries(
      this.constructor.schema.fields
    )) {
      if (field instanceof PseudoDocumentCollectionField) {
        const data = this._source[fieldName];
        const c = (collections[fieldName] =
          new field.constructor.implementation(fieldName, this, data));
        Object.defineProperty(this, fieldName, { value: c, writable: true });
      }
    }
    Object.defineProperty(this, 'collections', {
      value: Object.seal(collections),
      writable: false,
    });
  }

  static LOCALIZATION_PREFIXES = foundry.abstract.Document.LOCALIZATION_PREFIXES;

  _initialize(options) {
    super._initialize(options);
    if (!game._documentsReady) return;
    if (
      this.parent?.collections?.[this.parentCollection]?._initialized === false
    ) {
      return;
    }
    Object.entries(this.collections).forEach(([fieldName, collection]) => {
      collection.updateSource(this._source[fieldName]);
    });
    this._safePrepareData();
  }

  static get metadata() {
    return Object.freeze({ label: 'PseudoDocument' });
  }

  static get documentName() {
    throw new Error('PseudoDocuments must define their document name');
  }

  get documentName() {
    return this.constructor.documentName;
  }

  /** Shared schema, cached on the base subclass. */
  static get schema() {
    if (this._schema) return this._schema;
    const base = this.baseDocument;
    // eslint-disable-next-line no-prototype-builtins
    if (!base.hasOwnProperty('_schema')) {
      const schema = new foundry.data.fields.SchemaField(
        Object.freeze(base.defineSchema())
      );
      Object.defineProperty(base, '_schema', { value: schema, writable: false });
    }
    Object.defineProperty(this, '_schema', {
      value: base._schema,
      writable: false,
    });
    return base._schema;
  }

  /** The subclass just below PseudoDocument; owns the schema. */
  static get baseDocument() {
    let cls;
    let parent = this;
    while (parent) {
      cls = parent;
      parent = Object.getPrototypeOf(cls);
      if (parent === PseudoDocument) return cls;
    }
    throw new Error(
      `Base PseudoDocument class identification failed for "${this.documentName}"`
    );
  }

  get id() {
    return this._id;
  }

  _getParentCollection(parentCollection) {
    if (parentCollection) return parentCollection;
    return this.schema.parent.name;
  }

  /** The parent collection holding this document. */
  get collection() {
    return this.parent[this.parentCollection];
  }

  /** Nearest real Foundry Document ancestor. */
  get parentFoundryDocument() {
    let current = this.parent;
    while (current !== null) {
      if (current instanceof foundry.abstract.Document) return current;
      current = current.parent;
    }
    return null;
  }

  /** Nearest Document or PseudoDocument ancestor. */
  get parentDocument() {
    let current = this.parent;
    while (current !== null) {
      if (
        current instanceof foundry.abstract.Document ||
        current instanceof PseudoDocument
      )
        return current;
      current = current.parent;
    }
    return null;
  }

  /** @type {Actor|null} */
  get actor() {
    let current = this.parent;
    while (current !== null) {
      if (current instanceof Actor) return current;
      current = current.parent;
    }
    return null;
  }

  /** @type {Item|null} */
  get item() {
    let current = this.parent;
    while (current !== null) {
      if (current instanceof Item) return current;
      current = current.parent;
    }
    return null;
  }

  /** @type {string} */
  get uuid() {
    return [this.parentDocument.uuid, this.constructor.documentName, this.id].join(
      '.'
    );
  }

  get isEmbedded() {
    return true;
  }

  get isPseudoDocument() {
    return true;
  }

  toObject(source = true) {
    const data = super.toObject(source);
    return this.constructor.shimData(data);
  }

  /* -------------------------------------------- */
  /*  CRUD                                        */
  /* -------------------------------------------- */

  /**
   * Update this document and save it.
   * @param {object} [data={}]
   * @param {object} [operation={}]
   * @returns {Promise<PseudoDocument>}
   */
  async update(data = {}, operation = {}) {
    data._id = this.id;
    await this.constructor.updateDocuments([data], { parent: this.parent });
    return this;
  }

  /**
   * Create documents from input data.
   * @param {Array<object>} data
   * @param {object} operation
   * @returns {Promise<PseudoDocument[]>}
   */
  static async createDocuments(data = [], { parent } = {}) {
    if (!parent) throw new Error('PseudoDocument operations require a parent');
    const collection = parent.getEmbeddedCollection(this.documentName);
    const documents = [];
    for (const initialData of data) {
      initialData._id = foundry.utils.randomID();
      const document = collection.createDocument(initialData);
      documents.push(document.toObject(true));
    }

    const { changeObject, nestedCollection } = this._gatherChangeData(parent);
    nestedCollection.push(...documents);
    await parent.parentFoundryDocument.update(changeObject);
    return data.map((value) => collection.get(value._id));
  }

  /**
   * Update documents from differential data.
   * @param {object[]} updates
   * @param {object} operation
   * @returns {Promise<PseudoDocument[]>}
   */
  static async updateDocuments(updates = [], { parent } = {}) {
    if (!parent) throw new Error('PseudoDocument operations require a parent');
    const collection = parent.getEmbeddedCollection(this.documentName);

    const { changeObject, nestedCollection } = this._gatherChangeData(parent);
    for (const update of updates) {
      const item = nestedCollection.find((entry) => entry._id === update._id);
      if (!item) continue;
      const expandedUpdate = foundry.utils.expandObject(update);
      foundry.utils.mergeObject(item, expandedUpdate, {});
    }
    await parent.parentFoundryDocument.update(changeObject);
    return updates.map((value) => collection.get(value._id));
  }

  /**
   * Delete documents by id.
   * @param {string[]} ids
   * @param {object} operation
   * @returns {Promise<PseudoDocument[]>}
   */
  static async deleteDocuments(ids = [], { parent } = {}) {
    if (!parent) throw new Error('PseudoDocument operations require a parent');
    const collection = parent.getEmbeddedCollection(this.documentName);
    const deletedDocuments = ids
      .map((id) => collection.get(id))
      .filter((value) => !!value);
    const { changeObject, nestedCollection } = this._gatherChangeData(parent);
    nestedCollection.splice(
      0,
      nestedCollection.length,
      ...nestedCollection.filter((value) => !ids.includes(value._id))
    );
    await parent.parentFoundryDocument.update(changeObject);
    setTimeout(() => deletedDocuments.forEach((doc) => doc._onDelete()));
    return deletedDocuments;
  }

  /**
   * Delete this document.
   * @param {object} [operation={}]
   * @returns {Promise<PseudoDocument>}
   */
  async delete(operation = {}) {
    operation.parent = this.parent;
    await this.constructor.deleteDocuments([this.id], operation);
    this.parent.getEmbeddedCollection(this.documentName).delete(this.id);
    return this;
  }

  /**
   * Compute the update path and live source array for a CRUD operation. Walks from parent up to the
   * nearest Foundry Document, returning the dotted key and the array to mutate in place.
   * @param {PseudoDocument|foundry.abstract.DataModel} parent
   * @returns {{changeObject: object, nestedCollection: object[]}}
   * @private
   */
  static _gatherChangeData(parent) {
    /** @type {{index: string|number, type: "object"|"array"}[]} */
    const traversalInstructions = [];
    let current = parent;

    if (current.getEmbeddedCollection) {
      traversalInstructions.push({
        type: 'object',
        index: current.getEmbeddedCollection(this.documentName).name,
      });
    }

    while (current !== null && !(current instanceof foundry.abstract.Document)) {
      if (current instanceof PseudoDocument) {
        traversalInstructions.unshift({ type: 'array', index: current.id });
        traversalInstructions.unshift({
          type: 'object',
          index: current.parentCollection,
        });
      } else {
        traversalInstructions.unshift({
          type: 'object',
          index: current.schema.name,
        });
      }
      current = current.parent;
    }

    /** @type {{type: "object"|"array", index: string|number, value: any}[]} */
    const traversalLog = [];
    current = parent.parentFoundryDocument.toObject(true);

    for (const { type, index } of traversalInstructions) {
      if (type === 'object') {
        current = current[index];
        traversalLog.push({ type, index, value: current });
      } else if (type === 'array') {
        const arrayIndex = current.findIndex((value) => value._id === index);
        current = current[arrayIndex];
        traversalLog.push({ type: 'array', index: arrayIndex, value: current });
      }
    }

    const firstArray = traversalLog.findIndex((value) =>
      Array.isArray(value.value)
    );
    const baseKey = traversalLog
      .slice(0, firstArray + 1)
      .map((value) => value.index)
      .join('.');
    const nestedCollection = traversalLog.findLast((value) =>
      Array.isArray(value.value)
    );
    return {
      changeObject: { [baseKey]: traversalLog[firstArray].value },
      nestedCollection: nestedCollection.value,
    };
  }

  /**
   * Field name for an embedded pseudo-document type.
   * @param {string} name
   * @returns {string|null}
   */
  static getCollectionName(name) {
    if (name in this.schema.fields) return name;
    for (const [fieldName, field] of Object.entries(this.schema.fields)) {
      if (
        field instanceof PseudoDocumentCollectionField &&
        (field.model.name === name || field.model.documentName === name)
      )
        return fieldName;
    }
    return null;
  }

  /**
   * Get the embedded collection by name.
   * @param {string} embeddedName
   * @returns {PseudoDocumentCollection}
   */
  getEmbeddedCollection(embeddedName) {
    const collectionName = this.constructor.getCollectionName(embeddedName);
    if (!collectionName && this.system?.getEmbeddedCollection) {
      return this.system.getEmbeddedCollection(embeddedName);
    }
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

  /* -------------------------------------------- */
  /*  Data preparation                            */
  /* -------------------------------------------- */

  _safePrepareData() {
    try {
      this.prepareData();
    } catch (err) {
      Hooks.onError('PseudoDocument#prepareData', err, {
        msg: `Failed data preparation for ${this.uuid}`,
        log: 'error',
        uuid: this.uuid,
      });
    }
  }

  prepareData() {
    this.prepareBaseData();
    this.prepareEmbeddedDocuments();
    this.prepareDerivedData();
  }

  prepareBaseData() {}

  prepareEmbeddedDocuments() {
    for (const collectionName of Object.keys(this.collections || {})) {
      for (const e of this.collections[collectionName]) {
        e._safePrepareData();
      }
    }
  }

  prepareDerivedData() {}

  _onDelete() {
    Object.values(this.collections).forEach((collection) =>
      collection.forEach((doc) => doc._onDelete())
    );
  }
}
