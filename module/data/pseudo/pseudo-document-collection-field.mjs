import { PseudoDocument } from './pseudo-document.mjs';
import PseudoDocumentCollection from './pseudo-document-collection.mjs';

/**
 * ArrayField storing PseudoDocuments, exposed as a Collection of live model instances.
 */
export class PseudoDocumentCollectionField extends foundry.data.fields.ArrayField {
  /**
   * @param {typeof PseudoDocument} element  The PseudoDocument subclass stored in this collection.
   * @param {object} [options]               Options which configure the behavior of the field.
   * @param {object} [context]               Additional context which describes the field.
   */
  constructor(element, options = {}, context = {}) {
    super(element, options, context);
    this.readonly = true;
  }

  /** @override */
  static _validateElementType(element) {
    if (foundry.utils.isSubclass(element, PseudoDocument)) return element;
    throw new Error(
      'A PseudoDocumentCollectionField must specify a PseudoDocument subclass as its type'
    );
  }

  /**
   * The DataModel subclass of the embedded element.
   * @type {typeof PseudoDocument}
   */
  get model() {
    return this.element;
  }

  /**
   * Schema of the contained model.
   * @type {SchemaField}
   */
  get schema() {
    return this.model.schema;
  }

  static get implementation() {
    return PseudoDocumentCollection;
  }

  /** @inheritDoc */
  _cast(value) {
    if (foundry.utils.getType(value) !== 'Map') return super._cast(value);
    const arr = [];
    for (const [id, v] of value.entries()) {
      if (!('_id' in v)) v._id = id;
      arr.push(v);
    }
    return super._cast(arr);
  }

  /**
   * Schema to clean/validate a single element against: the subclass schema keyed by `type` for
   * typed collections, otherwise the shared base schema.
   * @param {object} v
   * @returns {SchemaField}
   */
  _schemaFor(v) {
    if (this.model.getSubclass) return this.model.getSubclass(v).schema;
    return this.schema;
  }

  /** @override */
  _cleanType(value, options) {
    return value.map((v) =>
      this._schemaFor(v).clean(v, { ...options, source: v })
    );
  }

  /**
   * @override
   * ArrayField recursion validates via `this.element.validate`, but `element` here is a
   * PseudoDocument subclass, not a DataField. Validate each entry against the model schema instead.
   */
  _validateRecursive(value, options) {
    const { DataModelValidationFailure } = foundry.data.validation;
    const collectionFailure = new DataModelValidationFailure(
      'PseudoDocumentCollectionField#_validateRecursive',
      { fieldPath: this.fieldPath, unresolved: false }
    );
    const collection = options.model?.[this.fieldPath];
    for (let i = value.length - 1; i >= 0; i--) {
      const v = value[i];
      const m = collection?.get?.(v._id);
      const validationOptions = {
        ...options,
        partial: false,
        model: m,
        strict: false,
      };
      const failure = this._schemaFor(v).validate(v, validationOptions);
      if (failure) {
        collectionFailure.elements.push({ id: i, failure });
        foundry.data.fields.ArrayField._handleValidationFailure(
          this.schema,
          value,
          i,
          collectionFailure,
          failure,
          {
            model: options.model,
            fallback: false,
            dropInvalidEmbedded: !!options.dropInvalidEmbedded,
          }
        );
      }
    }

    collectionFailure.unresolved = collectionFailure.elements.some(
      (e) => e.failure.unresolved
    );
    if (!collectionFailure.empty) {
      collectionFailure.elements.reverse();
      throw collectionFailure;
    }
  }

  /** @override */
  initialize(value, model, options = {}) {
    const collection = model.collections[this.name];
    collection.initialize(options);
    return collection;
  }

  /** @override */
  toObject(value) {
    return value.toObject(false);
  }

  /** @override */
  apply(fn, value = [], options = {}) {
    const thisFn = typeof fn === 'string' ? this[fn] : fn;
    thisFn?.call(this, value, options);

    const results = [];
    if (!value.length && options.initializeArrays) value = [undefined];
    for (const v of value) {
      const r = this.schema.apply(fn, v, options);
      if (!options.filter || !foundry.utils.isEmpty(r)) results.push(r);
    }
    return results;
  }

  /**
   * Migrate this field's candidate source data.
   * @param {any} value      The value of this field within the source data.
   * @param {object} options
   * @param {object} _state
   * @returns {any}
   * @override
   */
  _migrate(value, options, _state) {
    if (Array.isArray(value)) {
      for (const entry of value) this.model.migrateDataSafe(entry, options);
    }
    return value;
  }

  /**
   * Return the embedded collection for a given parent document.
   * @param {foundry.abstract.Document|PseudoDocument} parent  The parent document.
   * @returns {PseudoDocumentCollection}
   */
  getCollection(parent) {
    return parent.collections[this.name];
  }
}
