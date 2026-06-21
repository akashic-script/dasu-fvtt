/**
 * A Collection of PseudoDocuments backed by a source array on the parent DataModel.
 */
export default class PseudoDocumentCollection extends foundry.utils.Collection {
  /**
   * @param {string} name           The name of this collection in the parent Document.
   * @param {DataModel} parent      The parent DataModel instance to which this collection belongs.
   * @param {object[]} sourceArray  The source data array for the collection in the parent Document data.
   */
  constructor(name, parent, sourceArray) {
    super();
    Object.defineProperties(this, {
      _source: { value: sourceArray, writable: false },
      documentClass: {
        value: parent.constructor.schema.fields[name].element,
        writable: false,
      },
      name: { value: name, writable: false },
      model: { value: parent, writable: false },
    });
  }

  /** @type {typeof import('./pseudo-document.mjs').PseudoDocument} */
  documentClass;

  /** @type {string} */
  name;

  /** @type {DataModel} */
  model;

  /** @type {boolean} */
  _initialized = false;

  /** @type {object[]} */
  _source;

  /** @type {Set<string>} */
  invalidDocumentIds = new Set();

  /**
   * Instantiate a PseudoDocument for inclusion in the Collection.
   * @param {object} data       The Document data.
   * @param {object} [context]  Document creation context.
   * @returns {import('./pseudo-document.mjs').PseudoDocument}
   */
  createDocument(data, context = {}) {
    const cls = this.documentClass.getSubclass
      ? this.documentClass.getSubclass(data)
      : this.documentClass;
    return new cls(data, {
      ...context,
      parent: this.model,
      parentCollection: this.name,
    });
  }

  /**
   * Initialize the collection by constructing its contained PseudoDocument instances.
   * @param {object} [options]
   */
  initialize(options = {}) {
    if (this._initialized) {
      for (const doc of this.values()) {
        const sourceDoc = this._source.find((srcDoc) => srcDoc._id === doc._id);
        if (!sourceDoc) {
          this.delete(doc._id, { modifySource: false });
          doc._onDelete();
        }
      }
      for (const src of this._source) {
        if (this.has(src._id)) {
          this.get(src._id).updateSource(src);
        } else {
          this._initializeDocument(src, options);
        }
      }
      return;
    }

    this.clear();
    for (const d of this._source) {
      this._initializeDocument(d, options);
    }
    this._initialized = true;
  }

  /**
   * Replace the source array and re-initialize.
   * @param {object[]} data
   * @param {object} [options]
   */
  updateSource(data, options = {}) {
    this._source.splice(0, this._source.length, ...data);
    this.initialize(options);
  }

  /**
   * Initialize a single embedded document and store it in the collection.
   * @param {object} data
   * @param {object} [context]
   * @protected
   */
  _initializeDocument(data, context) {
    if (!data._id) {
      data._id = foundry.utils.randomID(16);
    }
    let doc;
    try {
      doc = this.createDocument(data, context);
      this.set(doc.id, doc, { modifySource: false });
    } catch (err) {
      this._handleInvalidDocument(data._id, err, context);
    }
  }

  /**
   * Log warnings or errors when a Document is found to be invalid.
   * @param {string} id
   * @param {Error} err
   * @param {object} [options]
   * @param {boolean} [options.strict=true]
   * @protected
   */
  _handleInvalidDocument(id, err, { strict = true } = {}) {
    const docName = this.documentClass.documentName;
    const parent = this.model;
    this.invalidDocumentIds.add(id);

    const uuid = `${parent.uuid}.${docName}.${id}`;
    const msg = `Failed to initialize ${docName} [${uuid}]:\n${err.message}`;
    const error = new Error(msg, { cause: err });

    if (strict) {
      globalThis.logger?.error(error) ?? console.error(error);
    } else {
      globalThis.logger?.warn(error) ?? console.warn(error);
    }
    if (globalThis.Hooks && strict) {
      Hooks.onError(`${this.constructor.name}#_initializeDocument`, error, {
        id,
        documentName: docName,
      });
    }
  }

  /**
   * Get an element from the collection by its ID.
   * @param {string} id
   * @param {object} [options]
   * @param {boolean} [options.strict=false]
   * @param {boolean} [options.invalid=false]
   * @returns {import('./pseudo-document.mjs').PseudoDocument}
   */
  get(id, { invalid = false, strict = false } = {}) {
    let result = super.get(id);
    if (!result && invalid) {
      result = this.getInvalid(id, { strict: false });
    }
    if (!result && strict) {
      throw new Error(
        `${this.documentClass.documentName} id [${id}] does not exist in the ${this.constructor.name} collection.`
      );
    }
    return result;
  }

  /**
   * Add an item to the collection.
   * @param {string} key
   * @param {import('./pseudo-document.mjs').PseudoDocument} value
   * @param {object} [options]
   * @param {boolean} [options.modifySource=true]
   */
  set(key, value, { modifySource = true, ...options } = {}) {
    if (modifySource) {
      this._set(key, value, options);
    }
    return super.set(key, value);
  }

  /**
   * Modify the underlying source array to include the Document.
   * @param {string} key
   * @param {import('./pseudo-document.mjs').PseudoDocument} value
   * @protected
   */
  _set(key, value) {
    if (this.has(key) || this.invalidDocumentIds.has(key)) {
      this._source.findSplice((d) => d._id === key, value._source);
    } else {
      this._source.push(value._source);
    }
  }

  /**
   * Remove an item from the collection.
   * @param {string} key
   * @param {object} [options]
   * @param {boolean} [options.modifySource=true]
   */
  delete(key, { modifySource = true, ...options } = {}) {
    if (modifySource) {
      this._delete(key, options);
    }
    return super.delete(key);
  }

  /**
   * Remove the value from the underlying source array.
   * @param {string} key
   * @protected
   */
  _delete(key) {
    if (this.has(key) || this.invalidDocumentIds.has(key)) {
      this._source.findSplice((d) => d._id === key);
    }
  }

  /**
   * Obtain a temporary Document instance for a document id which currently has invalid source data.
   * @param {string} id
   * @param {object} [options]
   * @param {boolean} [options.strict=true]
   * @returns {import('./pseudo-document.mjs').PseudoDocument}
   */
  getInvalid(id, { strict = true } = {}) {
    if (!this.invalidDocumentIds.has(id)) {
      if (strict) {
        throw new Error(
          `${this.documentClass.documentName} id [${id}] is not in the set of invalid ids`
        );
      }
      return;
    }
    const data = this._source.find((d) => d._id === id);
    return this.documentClass.fromSource(foundry.utils.deepClone(data), {
      parent: this.model,
    });
  }

  /**
   * Convert the collection to an array of simple objects.
   * @param {boolean} [source=true]
   * @returns {object[]}
   */
  toObject(source = true) {
    const arr = [];
    for (const doc of this.values()) {
      arr.push(doc.toObject(source));
    }
    return arr;
  }
}
