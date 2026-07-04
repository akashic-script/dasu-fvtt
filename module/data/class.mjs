import DASUItemBase from './item-base.mjs';
import BaseAdvancement from './advancements/base-advancement.mjs';
import { AptitudeAdvancement } from './advancements/_module.mjs';
import { PseudoDocumentCollectionField } from './pseudo/pseudo-document-collection-field.mjs';

export default class DASUClass extends DASUItemBase {
  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    schema.sp = new fields.SchemaField({
      base: new fields.NumberField({ ...requiredInteger, initial: 3, min: 0 }),
      perLevel: new fields.NumberField({ ...requiredInteger, initial: 2, min: 0 }),
    });

    schema.ap = new fields.SchemaField({
      base: new fields.NumberField({ ...requiredInteger, initial: 2, min: 0 }),
      perStep: new fields.NumberField({ ...requiredInteger, initial: 1, min: 0 }),
      stepEvery: new fields.NumberField({ ...requiredInteger, initial: 2, min: 1 }),
    });

    schema.advancements = new PseudoDocumentCollectionField(BaseAdvancement);

    return schema;
  }

  /**
   */
  static migrateData(source) {
    const advs = source?.advancements;
    if (Array.isArray(advs) && advs.some((a) => a && a.type === undefined)) {
      const migrated = [];
      for (const a of advs) {
        if (!a || typeof a !== 'object') continue;
        if (a.type !== undefined) {
          migrated.push(a);
          continue;
        }
        const level = a.level ?? 1;
        const description = a.description ?? '';
        const base = () => ({
          _id: foundry.utils.randomID(),
          level,
          description,
          sort: a.sort ?? 0,
        });
        if (a.aptitudeUp > 0) {
          migrated.push({ ...base(), type: 'aptitude', amount: a.aptitudeUp });
        }
        if (a.slot?.upgradeSlot > 0 && a.slot?.upgradeTo > 0) {
          migrated.push({
            ...base(),
            type: 'schemaUpgrade',
            slotNumber: a.slot.upgradeSlot,
            upgradeTo: a.slot.upgradeTo,
          });
        }
        for (const grant of a.itemGrants ?? []) {
          if (!grant) continue;
          if (grant.type === 'schema' || grant.type === '' || !grant.type) {
            migrated.push({
              ...base(),
              type: 'schemaSlot',
              itemType: grant.type === 'schema' ? 'schema' : '',
            });
          } else {
            migrated.push({ ...base(), type: 'itemGrant', itemType: grant.type });
          }
        }
      }
      source.advancements = migrated;
    }
    return super.migrateData(source);
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    for (const advancement of this.advancements) {
      advancement._safePrepareData();
    }
  }

  spMax(level) {
    return this.sp.base + Math.max(0, level - 1) * this.sp.perLevel;
  }

  /**
   * Maximum attribute points this class grants at a given level.
   * @param {number} level
   * @returns {number}
   */
  apMax(level) {
    const steps = Math.floor((Math.max(1, level) - 1) / this.ap.stepEvery) + 1;
    return this.ap.base + (steps - 1) * this.ap.perStep;
  }

  aptitudeUpsTotal(level) {
    let total = 0;
    for (const a of this.advancements) {
      if (a.level <= level && a instanceof AptitudeAdvancement) {
        total += a.amount || 0;
      }
    }
    return total;
  }
}
