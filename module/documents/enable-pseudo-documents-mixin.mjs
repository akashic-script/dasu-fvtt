import { PseudoDocument } from '../data/pseudo/pseudo-document.mjs';

/**
 * Lets a Document host pseudo-document collections on its system model: CRUD for
 * pseudo-document types is delegated to `this.system`, everything else falls through.
 */
export function EnablePseudoDocumentsMixin(Base) {
  if (!foundry.utils.isSubclass(Base, foundry.abstract.Document)) {
    throw new Error(`${Base.name} is not a Document`);
  }

  return class DocumentWithPseudoDocuments extends Base {
    getEmbeddedCollection(embeddedName) {
      const collectionName = this.constructor.getCollectionName?.(embeddedName);
      if (!collectionName && this.system?.getEmbeddedCollection) {
        try {
          return this.system.getEmbeddedCollection(embeddedName);
        } catch (err) {
          // not a pseudo collection; fall through to core
        }
      }
      return super.getEmbeddedCollection(embeddedName);
    }

    async createEmbeddedDocuments(embeddedName, data = [], operation = {}) {
      if (this.#isPseudoCollection(embeddedName)) {
        return this.system.createEmbeddedDocuments(
          embeddedName,
          data,
          operation
        );
      }
      return super.createEmbeddedDocuments(embeddedName, data, operation);
    }

    async updateEmbeddedDocuments(embeddedName, updates = [], operation = {}) {
      if (this.#isPseudoCollection(embeddedName)) {
        const cls =
          this.system.getEmbeddedCollection(embeddedName).documentClass;
        return cls.updateDocuments(updates, { parent: this.system });
      }
      return super.updateEmbeddedDocuments(embeddedName, updates, operation);
    }

    async deleteEmbeddedDocuments(embeddedName, ids = [], operation = {}) {
      if (this.#isPseudoCollection(embeddedName)) {
        const cls =
          this.system.getEmbeddedCollection(embeddedName).documentClass;
        return cls.deleteDocuments(ids, { parent: this.system });
      }
      return super.deleteEmbeddedDocuments(embeddedName, ids, operation);
    }

    #isPseudoCollection(embeddedName) {
      if (!this.system?.getEmbeddedCollection) return false;
      try {
        const collection = this.system.getEmbeddedCollection(embeddedName);
        return foundry.utils.isSubclass(
          collection.documentClass,
          PseudoDocument
        );
      } catch (err) {
        return false;
      }
    }
  };
}
