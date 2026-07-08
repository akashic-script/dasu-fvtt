/**
 * Recursively drop party actors and any actor already shown inside a party
 * pseudo-folder from a directory tree node and its children. Foundry's
 * directory tree nests entries per-folder at every depth, not just at the
 * root, so this has to walk it rather than filtering only the root entries.
 * @param {object} node
 * @param {Set<string>} shownIds
 * @returns {object}
 */
export function pruneShownEntries(node, shownIds) {
  return {
    ...node,
    entries: node.entries.filter(
      (e) => e.type !== 'party' && !shownIds.has(e.id)
    ),
    children: node.children.map((child) => pruneShownEntries(child, shownIds)),
  };
}
