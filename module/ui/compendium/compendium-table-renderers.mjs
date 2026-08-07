/**
 * Read-only table renderers for the {@link CompendiumBrowser}: a name cell, a few
 * type-specific columns, and a trailing "open" button. Left-click a row to expand
 * its description; open button or middle-click opens the source sheet. `getItems`
 * gets the entry array as-is; visibility is applied via the `isVisible` option.
 */

import { DASUTableRenderer } from '../../helpers/tables/table-renderer.mjs';
import { CommonColumns } from '../../helpers/tables/common-columns.mjs';
import { CommonDescriptions } from '../../helpers/tables/common-descriptions.mjs';
import { DASU } from '../../helpers/config.mjs';

/** Trailing column with a button that opens the entry's source sheet. */
const openColumn = () => ({
  hideHeader: true,
  headerAlignment: 'end',
  renderCell: () =>
    `<a class="dasu-compendium-open" data-action="openEntry" data-tooltip="${game.i18n.localize(
      'DASU.CompendiumBrowser.Open'
    )}"><i class="fas fa-up-right-from-square"></i></a>`,
});

/** Base for compendium renderers: entries in, entries out. */
class CompendiumTableRenderer extends DASUTableRenderer {
  static TABLE_CONFIG = {
    tablePreset: 'compendium-item',
    getItems: (entries) => (entries ?? []).filter((e) => e.name),
    // Sorting is owned by the CompendiumBrowser (header clicks); preserve the
    // order it hands us rather than re-sorting by name here.
    sort: false,
    actions: {
      openEntry: CompendiumTableRenderer.#onOpenEntry,
    },
  };

  /** Column id -> comparable-value getter, for header-click sorting. Columns absent here aren't sortable. */
  static SORT_KEYS = {
    name: (entry) => entry.name ?? '',
  };

  /** Resolve the clicked row's document by uuid and open its sheet. */
  static async #onOpenEntry(event, target) {
    event.preventDefault();
    const uuid = target.closest('[data-key]')?.dataset.key;
    if (!uuid) return;
    const doc = await fromUuid(uuid);
    doc?.sheet?.render(true);
  }
}

export class DaemonCompendiumRenderer extends CompendiumTableRenderer {
  static SORT_KEYS = {
    ...CompendiumTableRenderer.SORT_KEYS,
    level: (entry) => entry.system?.level ?? 0,
    // Sort by the first role's localized label, matching the cell's ordering.
    roles: (entry) =>
      game.i18n.localize(DASU.daemonRoles[entry.system?.roles?.[0]] ?? ''),
  };

  static TABLE_CONFIG = {
    tablePreset: 'actor',
    cssClass: 'compendium-daemon-table',
    renderDescription: CommonDescriptions.simpleDescription('system.biography'),
    columns: {
      name: CommonColumns.itemAnchorColumn({ columnName: 'DASU.Name' }),
      level: CommonColumns.textColumn({
        columnLabel: 'DASU.Level',
        getText: (entry) => entry.system?.level ?? '–',
      }),
      roles: CommonColumns.textColumn({
        columnLabel: 'DASU.Daemon.Roles',
        getText: (entry) => {
          const roles = entry.system?.roles;
          if (!Array.isArray(roles) || !roles.length) return '–';
          return roles
            .map((r) => game.i18n.localize(DASU.daemonRoles[r] ?? r))
            .join(', ');
        },
      }),
      open: openColumn(),
    },
  };
}

// Index entries are plain objects, so the DamageData/HealData label getters
// aren't available; localize from the raw `.type`/`.resource` here instead.

/** Localized damage type, or '' for untyped/blank so callers can omit it. */
const damageTypeLabel = (damage) => {
  const type = damage?.type;
  if (!type || type === 'untyped') return '';
  return game.i18n.localize(DASU.damageTypes[type] ?? '');
};

const healResourceLabel = (heal) =>
  game.i18n.localize(DASU.abilityHealResources[heal?.resource] ?? '');

/** "value type" damage summary, or '–' when there's no value. */
const damageSummary = (damage) => {
  if (damage?.value == null) return '–';
  return game.i18n
    .format('DASU.CompendiumBrowser.SummaryDmg', {
      value: damage.value,
      type: damageTypeLabel(damage),
    })
    .replace(/\s+/g, ' ');
};

/** One-line type-specific summary for the merged Items tab. */
const ITEM_SUMMARY_FORMATTERS = {
  archetype: (entry) => {
    const bonuses = entry.system?.bonuses;
    if (!Array.isArray(bonuses)) return '–';
    const summary = bonuses
      .filter((b) => b?.target && b.formula?.trim())
      .map((b) => `${b.formula} -> ${b.target}`)
      .join(', ');
    return summary || '–';
  },
  subtype: (entry) => {
    const stat = entry.system?.statAllocationBonus ?? 0;
    const abilitySlots = entry.system?.maxAbilitySlots ?? 0;
    const tacticSlots = entry.system?.maxTacticSlots ?? 0;
    return `STAT+${stat}, ${abilitySlots} abilities, ${tacticSlots} tactics`;
  },
  item: (entry) => {
    const effect = entry.system?.effects?.[0];
    if (!effect) return '–';
    const resource = game.i18n.localize(
      DASU.itemResources[effect.resource] ?? ''
    );
    return `${effect.value ?? ''}${
      effect.mode === 'percent' ? '%' : ''
    } ${resource}`.trim();
  },
  weapon: (entry) => {
    const d = entry.system?.damage;
    const toHit = entry.system?.toHit;
    const parts = [];
    if (d?.value != null) parts.push(damageSummary(d));
    if (toHit != null)
      parts.push(
        game.i18n.format('DASU.CompendiumBrowser.SummaryHit', { value: toHit })
      );
    return parts.join(', ') || '–';
  },
  ability: (entry) => {
    const category = entry.system?.category;
    if (category === 'restorative') {
      const h = entry.system?.heal;
      const val = h?.value ?? 0;
      if (!val) return '–';
      return game.i18n.format('DASU.CompendiumBrowser.SummaryHeal', {
        value: `${val}${h?.mode === 'percent' ? '%' : ''}`,
        resource: healResourceLabel(h),
      });
    }
    if (category === 'affliction') return entry.system?.isInfinity ? '∞' : '–';
    return damageSummary(entry.system?.damage);
  },
  tactic: (entry) => {
    const d = entry.system?.damage;
    const governAbbr = game.i18n
      .localize(DASU.attributeAbbreviations[entry.system?.govern] ?? '')
      .toUpperCase();
    const val = d?.value ?? 0;
    const type = damageTypeLabel(d);
    return `${governAbbr}+${val}${type ? ` ${type}` : ''}`;
  },
  feature: () => '–',
  class: (entry) => {
    const sp = entry.system?.sp;
    if (!sp) return '–';
    return `${game.i18n.localize('DASU.Actor.SP')} ${sp.base ?? 0}+${
      sp.perLevel ?? 0
    }/lvl`;
  },
  schema: (entry) => {
    const level = entry.system?.level ?? 1;
    return `${game.i18n.localize('DASU.Item.Schema.Level')} ${level}`;
  },
  specialAbility: (entry) =>
    game.i18n.localize(DASU.specialAbilityKinds?.[entry.system?.kind] ?? '–'),
  skillAbility: (entry) => entry.system?.skillLabel || '–',
  scar: () => '–',
};

export class ItemsCompendiumRenderer extends CompendiumTableRenderer {
  static SORT_KEYS = {
    ...CompendiumTableRenderer.SORT_KEYS,
    type: (entry) => game.i18n.localize(`TYPES.Item.${entry.type}`),
  };

  static TABLE_CONFIG = {
    cssClass: 'compendium-item-mixed-table',
    renderDescription: CommonDescriptions.simpleDescription(),
    columns: {
      name: CommonColumns.itemAnchorColumn({ columnName: 'DASU.Name' }),
      type: CommonColumns.textColumn({
        columnLabel: 'DASU.CompendiumBrowser.Type',
        getText: (entry) => game.i18n.localize(`TYPES.Item.${entry.type}`),
      }),
      summary: CommonColumns.textColumn({
        columnLabel: 'DASU.CompendiumBrowser.Summary',
        alignment: 'start',
        getText: (entry) =>
          (ITEM_SUMMARY_FORMATTERS[entry.type] ?? (() => '–'))(entry),
      }),
      open: openColumn(),
    },
  };
}

/** Human-readable duration for an effect index entry, e.g. "3 turns" or "∞". */
const formatEffectDuration = (entry) => {
  const duration = entry.duration ?? {};
  const value = duration.value;
  if (value == null || value === '') return '∞';
  const units = duration.units;
  const unitLabel = units
    ? game.i18n.localize(`DASU.CompendiumBrowser.DurationUnit.${units}`)
    : '';
  return `${value} ${unitLabel}`.trim();
};

/** Effect summary: its stat `changes`, else a stack note, else a dash. */
const formatEffectSummary = (entry) => {
  const changes = entry.changes;
  if (Array.isArray(changes) && changes.length) {
    return changes
      .map((c) => {
        const sign = c.mode === 2 && !`${c.value}`.startsWith('-') ? '+' : '';
        return `${sign}${c.value} ${c.key}`.trim();
      })
      .join(', ');
  }
  const maxStacks = entry.flags?.dasu?.maxStacks;
  if (maxStacks != null) {
    return game.i18n.format('DASU.CompendiumBrowser.MaxStacks', {
      max: maxStacks,
    });
  }
  return '–';
};

export class EffectCompendiumRenderer extends CompendiumTableRenderer {
  static SORT_KEYS = {
    ...CompendiumTableRenderer.SORT_KEYS,
    // Numeric duration; open-ended (∞) sorts last ascending.
    duration: (entry) => {
      const value = entry.duration?.value;
      return value == null || value === '' ? Infinity : Number(value);
    },
  };

  static TABLE_CONFIG = {
    cssClass: 'compendium-effect-table',
    renderDescription: CommonDescriptions.simpleDescription('description'),
    columns: {
      name: CommonColumns.itemAnchorColumn({ columnName: 'DASU.Name' }),
      duration: CommonColumns.textColumn({
        columnLabel: 'DASU.CompendiumBrowser.Duration',
        getText: formatEffectDuration,
      }),
      summary: CommonColumns.textColumn({
        columnLabel: 'DASU.CompendiumBrowser.Summary',
        alignment: 'start',
        getText: formatEffectSummary,
      }),
      open: openColumn(),
    },
  };
}

export class TagCompendiumRenderer extends CompendiumTableRenderer {
  static SORT_KEYS = {
    ...CompendiumTableRenderer.SORT_KEYS,
    price: (entry) => Number(entry.system?.pricePerRank) || 0,
  };

  static TABLE_CONFIG = {
    cssClass: 'compendium-tag-table',
    renderDescription: CommonDescriptions.simpleDescription(),
    columns: {
      name: CommonColumns.itemAnchorColumn({ columnName: 'TYPES.Item.tag' }),
      price: CommonColumns.textColumn({
        columnLabel: 'DASU.Tag.Price',
        getText: (entry) => entry.system?.pricePerRank || '–',
      }),
      types: CommonColumns.textColumn({
        columnLabel: 'DASU.Tag.Types',
        alignment: 'start',
        getText: (entry) => {
          const types = entry.system?.applicableTypes;
          if (!Array.isArray(types) || !types.length || types.includes('all'))
            return game.i18n.localize('DASU.Tag.ApplicableAll');
          return types
            .map((t) => game.i18n.localize(`TYPES.Item.${t}`) || t)
            .join(', ');
        },
      }),
      open: openColumn(),
    },
  };
}
