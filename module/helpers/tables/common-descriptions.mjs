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

export const CommonDescriptions = Object.freeze({
  simpleDescription,
  descriptionWithTags,
});
