import { DASUTableRenderer } from './table-renderer.mjs';
import { CommonColumns } from './common-columns.mjs';
import { CommonDescriptions } from './common-descriptions.mjs';

/** The Difficulty Threshold shown in the table cell and expand tags. */
function thresholdText(item) {
  const sys = item.system;
  if (sys.thresholdType === 'fixed') return `TN ${sys.fixedTN}`;
  return game.i18n.localize(`DASU.SkillAbility.Threshold.${sys.thresholdType === 'defense' ? 'Defense' : 'Avoid'}`);
}

export class SkillAbilityTableRenderer extends DASUTableRenderer {
  /** @type {TableConfig} */
  static TABLE_CONFIG = {
    cssClass: 'skill-ability-table',
    getItems: (document) => document.itemTypes.skillAbility ?? [],
    renderDescription: CommonDescriptions.descriptionWithTags((item) => {
      const tags = [];
      if (item.system.skillLabel) tags.push({ label: 'DASU.SkillAbility.Skill', value: item.system.skillLabel });
      tags.push({ label: 'DASU.SkillAbility.Threshold.Label', value: thresholdText(item) });
      if (item.system.costsMainAction) tags.push({ label: 'DASU.SkillAbility.CostsMainAction', value: '✓' });
      return tags;
    }),
    columns: {
      name: CommonColumns.itemNameColumn({ columnName: 'TYPES.Item.skillAbility' }),
      skill: CommonColumns.textColumn({
        columnLabel: 'DASU.SkillAbility.Skill',
        getText: (item) => item.system.skillLabel || '–',
      }),
      threshold: CommonColumns.textColumn({
        columnLabel: 'DASU.SkillAbility.Threshold.Label',
        getText: thresholdText,
      }),
      controls: CommonColumns.itemControlsColumn({
        type: 'skillAbility',
        label: 'TYPES.Item.skillAbility',
        disableDelete: (item) => !(item.parent instanceof Actor),
        disableEdit: (item) => !(item.parent instanceof Actor),
      }),
    },
  };
}
