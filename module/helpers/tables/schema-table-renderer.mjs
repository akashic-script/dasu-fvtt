import { DASUTableRenderer } from './table-renderer.mjs';
import { CommonColumns } from './common-columns.mjs';

const EXPAND_TEMPLATE = 'systems/dasu/templates/table/expand/expand-schema-description.hbs';
const TextEditor = () => foundry.applications.ux.TextEditor.implementation;

export class SchemaTableRenderer extends DASUTableRenderer {
  /** @type {TableConfig} */
  static TABLE_CONFIG = {
    cssClass: 'schema-table',
    getItems: SchemaTableRenderer.#getItems,
    renderDescription: SchemaTableRenderer.#renderDescription,
    columns: {
      name: CommonColumns.itemNameColumn({ columnName: 'TYPES.Item.schema' }),
      level: CommonColumns.textColumn({
        columnLabel: 'DASU.Item.Schema.Level',
        getText: (item) => item.system.level ?? 1,
      }),
      controls: CommonColumns.itemControlsColumn({
        type: 'schema',
        label: 'TYPES.Item.schema',
      }),
    },
  };

  static #getItems(document) {
    return document.itemTypes.schema ?? [];
  }

  static async #renderDescription(item) {
    const enrich = (html) => TextEditor().enrichHTML(html ?? '', {
      relativeTo: item,
      secrets: item.isOwner,
      rollData: item.getRollData?.() ?? {},
    });

    const [d1, d2, d3] = await Promise.all([
      enrich(item.system.level1?.description),
      enrich(item.system.level2?.description),
      enrich(item.system.level3?.description),
    ]);

    return foundry.applications.handlebars.renderTemplate(EXPAND_TEMPLATE, {
      tags: SchemaTableRenderer.#getTags(item),
      levels: [
        { label: 'DASU.Item.Schema.Level1', description: d1 },
        { label: 'DASU.Item.Schema.Level2', description: d2 },
        { label: 'DASU.Item.Schema.Level3', description: d3 },
      ],
    });
  }

  static #getTags(item) {
    const level = item.system.level ?? 1;
    const levelKey = `level${level}`;
    const resource = item.system[levelKey]?.resource;

    const tags = [
      {
        label: 'DASU.Item.Schema.Level',
        value: level,
      },
    ];

    if (resource?.cost && resource.cost !== '0') {
      tags.push({
        label: 'DASU.Resource.CostLabelResource',
        value: `${resource.cost} ${resource.type.toUpperCase()}`,
      });
    }

    return tags;
  }
}
