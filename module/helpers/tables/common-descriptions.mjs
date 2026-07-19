/**
 * Shared expand-row description renderers for DASU table renderers.
 *
 * TODO (PseudoItem / sub-items): when DASU gets a slot/socket system, add
 * descriptionWithSlots - renders slotted child items inline in the expand row.
 */

const TEMPLATE = (path) => `systems/dasu/templates/table/${path}.hbs`;

/**
 * Enrich and render `system.description` with no tags.
 * @param {string} [descriptionKey="system.description"]
 * @return {(item: Item) => Promise<string>}
 */
function simpleDescription(descriptionKey) {
  return (item) => _renderDescription(item, descriptionKey, []);
}

/**
 * Enrich and render `system.description` with a row of tags above it.
 * @param {(item: Item) => Tag[]} getTags
 * @param {string} [descriptionKey="system.description"]
 * @return {(item: Item) => Promise<string>}
 */
function descriptionWithTags(getTags, descriptionKey) {
  return async function (item) {
    const tags = await getTags.call(this, item);
    return _renderDescription(item, descriptionKey, tags);
  };
}

/**
 * @typedef Tag
 * @property {string} label   i18n key
 * @property {string | number} value
 */

/**
 * @param {Item} item
 * @param {string} [descriptionKey="system.description"]
 * @param {Tag[]} [tags]
 * @return {Promise<string>}
 */
async function _renderDescription(
  item,
  descriptionKey = 'system.description',
  tags = []
) {
  const TextEditor = foundry.applications.ux.TextEditor.implementation;
  const raw = foundry.utils.getProperty(item, descriptionKey) ?? '';
  const description = await TextEditor.enrichHTML(raw, {
    relativeTo: item,
    secrets: item.isOwner,
    rollData: item.getRollData?.() ?? {},
  });
  return foundry.applications.handlebars.renderTemplate(
    TEMPLATE('expand/expand-item-description-with-tags'),
    { description, tags }
  );
}

/**
 * Compact tag chip sub-row rendered below a row when its item has slotted tags.
 * @return {(item: Item) => string}
 */
function slottedTagCaption() {
  return function (item) {
    const tags = item.system?.tags ? [...item.system.tags] : [];
    if (!tags.length) return '';
    const used = item.system?.tagSlotsUsed ?? 0;
    const rawMax = item.system?.tagBudget ?? 0;
    const max = Number.isFinite(rawMax) ? rawMax : '∞';
    const budget = `<span class="item-tag-caption__budget" data-tooltip="${game.i18n.localize(
      'DASU.Tag.SlotsUsed'
    )}">${used}/${max}</span>`;
    const chips = tags
      .map((tag) => {
        const rank = tag.rank?.current ?? 1;
        const rankChip =
          rank > 1 ? `<span class="item-tag-chip__tier">×${rank}</span>` : '';
        const removeBtn = `<a class="item-tag-chip__remove" data-action="removeSlottedTag" data-item-id="${
          item.id
        }" data-tag-id="${tag.id}" data-tooltip="${game.i18n.localize(
          'DASU.Sheet.DeleteItem'
        )}"><i class="fas fa-times"></i></a>`;
        return `<span class="item-tag-chip" data-action="openSlottedTag" data-item-id="${
          item.id
        }" data-tag-id="${tag.id}"><span class="item-tag-chip__name">${
          tag.name ?? ''
        }</span>${rankChip}${removeBtn}</span>`;
      })
      .join('');
    return `<div class="item-tag-caption">${budget}${chips}</div>`;
  };
}

export const CommonDescriptions = Object.freeze({
  simpleDescription,
  descriptionWithTags,
  slottedTagCaption,
});
