import DASUItemBase from './item-base.mjs';
import BaseAdvancement from './advancements/base-advancement.mjs';
import { PseudoDocumentCollectionField } from './pseudo/pseudo-document-collection-field.mjs';

/**
 * The Dejection item (one per summoner, like Class). Holds the summoner's
 * Relentless Curses - pseudo-document advancements keyed to Dejection thresholds
 * that author the Will-damage penalties and Scar slots.
 */
export default class DASUDejection extends DASUItemBase {
  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();
    schema.advancements = new PseudoDocumentCollectionField(BaseAdvancement);
    return schema;
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    for (const advancement of this.advancements) {
      advancement._safePrepareData();
    }
  }

  /**
   * Sum the penalties of every Relentless Curse active at the given Dejection.
   * @param {number} dejection current dejection track value
   * @returns {{ wpMaxPct: number, wpMaxFlat: number, avoid: number, hit: number, crit: number }}
   */
  penaltiesAt(dejection) {
    const out = { wpMaxPct: 0, wpMaxFlat: 0, avoid: 0, hit: 0, crit: 0 };
    for (const curse of this.advancements) {
      if (curse.constructor.TYPE !== 'relentlessCurse') continue;
      if ((curse.level ?? 1) > dejection) continue;
      out.wpMaxPct += curse.wpMaxPct ?? 0;
      out.wpMaxFlat += curse.wpMaxFlat ?? 0;
      out.avoid += curse.avoid ?? 0;
      out.hit += curse.hit ?? 0;
      out.crit += curse.crit ?? 0;
    }
    out.wpMaxPct = Math.min(100, out.wpMaxPct);
    return out;
  }
}
