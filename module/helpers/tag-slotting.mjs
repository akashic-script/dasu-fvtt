import { DASU, SYSTEM } from './config.mjs';
import BaseTag from '../data/tags/base-tag.mjs';

/**
 * Slotting catalog `tag` Items onto taggable host items (ability/weapon/tactic).
 *
 * A slotted tag is a `BaseTag` pseudo-document in `hostItem.system.tags`. The
 * catalog tag's ActiveEffects are copied onto the host once and flagged with the
 * slotted tag's id, so Foundry's `transfer` field routes them (false stays on the
 * item, true reaches the actor); on removal both are deleted together.
 */

/** Flag key (under the `dasu` scope) linking a host effect to its source tag. */
export const SOURCE_TAG_FLAG = 'sourceTagId';

const reconcilingTags = new Set();

export function buildSlottedTagData(tagItem) {
  return {
    type: 'base',
    name: tagItem.name,
    description: tagItem.system.description ?? '',
    rank: { current: 1 },
    applicableTypes: tagItem.system.applicableTypes ?? [],
    applicableSubType: tagItem.system.applicableSubType ?? [],
    pricePerRank: tagItem.system.pricePerRank ?? 0,
    sourceUuid: tagItem.uuid,
  };
}

/**
 * Validate and slot a catalog tag onto a host item, then transfer its effects.
 * Returns the BaseTag pseudo-document, or null if validation failed.
 */
export async function slotTag(tagItem, hostItem) {
  if (!DASU.taggableTypes?.includes(hostItem.type)) return null;
  if (tagItem?.type !== 'tag') return null;

  if (!tagItem.system.isValidForHost(hostItem)) {
    ui.notifications?.warn(game.i18n.localize('DASU.Tag.WrongType'));
    return null;
  }

  // Adding a tag and raising an existing tag's rank both cost one slot.
  if ((hostItem.system.tagBudgetFree ?? 0) < 1) {
    ui.notifications?.warn(game.i18n.localize('DASU.Tag.NoSlots'));
    return null;
  }

  const existing = [...(hostItem.system?.tags ?? [])].find(
    (t) => t.sourceUuid === tagItem.uuid
  );
  if (existing) {
    await existing.update({
      'rank.current': (existing.rank?.current ?? 1) + 1,
    });
    return existing;
  }

  // createEmbeddedDocuments mutates the payload with a fresh _id in place; its
  // return value is unreliable (the collection ref goes stale after the parent
  // update), so read the id back off the payload.
  const payload = buildSlottedTagData(tagItem);
  await hostItem.createEmbeddedDocuments('Tag', [payload]);
  const tagId = payload._id;

  if (tagId) {
    await transferTagEffects(tagItem, hostItem, tagId);
  }

  return tagId ? hostItem.system?.tags?.get(tagId) ?? null : null;
}

/**
 * Copy a catalog tag's ActiveEffects onto the host, each flagged with the source
 * tag id. Foundry's `transfer` field is preserved as authored.
 */
export async function transferTagEffects(tagItem, hostItem, slottedTagId) {
  const sourceEffects = tagItem.effects?.contents ?? [];
  if (!sourceEffects.length) return;

  const effectData = sourceEffects.map((effect) => {
    const data = effect.toObject();
    delete data._id;
    data.flags ??= {};
    data.flags[SYSTEM] = {
      ...(data.flags[SYSTEM] ?? {}),
      [SOURCE_TAG_FLAG]: slottedTagId,
      sourceTagUuid: tagItem.uuid,
    };
    data.origin = hostItem.uuid;
    return data;
  });

  await hostItem.createEmbeddedDocuments('ActiveEffect', effectData);
}

/** Delete host-item ActiveEffects that were transferred by a given slotted tag. */
export async function removeTagEffects(hostItem, slottedTagId) {
  const ids = (hostItem.effects?.contents ?? [])
    .filter((e) => e.getFlag(SYSTEM, SOURCE_TAG_FLAG) === slottedTagId)
    .map((e) => e.id);
  if (ids.length) {
    await hostItem.deleteEmbeddedDocuments('ActiveEffect', ids);
  }
}

/** Remove a slotted tag pseudo-document and its transferred effects together. */
export async function unslotTag(hostItem, tagId) {
  const tag = hostItem?.system?.tags?.get(tagId);
  if (!tag) return;
  // Delete effects first so a failed tag delete doesn't orphan them.
  await removeTagEffects(hostItem, tagId);
  await tag.delete();
}

/**
 * Reconcile slotted copies of a catalog tag after it is edited: sync each copy's
 * applicability to the catalog values, then unslot copies whose host no longer
 * qualifies. Scoped to the catalog tag's owning actor.
 */
export async function resyncCatalogTag(catalogTag) {
  const actor = catalogTag?.parent;
  if (!(actor instanceof Actor)) return;
  if (reconcilingTags.has(catalogTag.id)) return;
  reconcilingTags.add(catalogTag.id);
  try {
    const applicableTypes = catalogTag.system.applicableTypes ?? [];
    const applicableSubType = catalogTag.system.applicableSubType ?? [];
    const newAppl = { applicableTypes, applicableSubType };

    let pruned = 0;
    for (const hostItem of actor.items) {
      if (!DASU.taggableTypes?.includes(hostItem.type)) continue;
      const slottedIds = [...(hostItem.system?.tags ?? [])]
        .filter((t) => t.sourceUuid === catalogTag.uuid)
        .map((t) => t.id);

      for (const tagId of slottedIds) {
        if (!BaseTag.checkValidForHost(newAppl, hostItem)) {
          await unslotTag(hostItem, tagId);
          pruned++;
        } else {
          await hostItem.system?.tags?.get(tagId)?.update(newAppl);
        }
      }
    }

    if (pruned) {
      ui.notifications?.info(
        game.i18n.format('DASU.Tag.Pruned', {
          name: catalogTag.name,
          count: pruned,
        })
      );
    }
  } finally {
    reconcilingTags.delete(catalogTag.id);
  }
}

/**
 * Push the catalog tag's current state onto its slotted copies: re-sync the
 * snapshotted fields (name/description/applicability/price) and replace each
 * copy's transferred effects with fresh copies from the catalog tag. Rank is
 * per-slot state and is preserved.
 * @returns {Promise<number>} the number of slotted copies refreshed
 */
export async function refreshSlottedTags(catalogTag) {
  const actor = catalogTag?.parent;
  if (!(actor instanceof Actor)) return 0;
  if (reconcilingTags.has(catalogTag.id)) return 0;
  reconcilingTags.add(catalogTag.id);
  let refreshed = 0;
  try {
    const snapshot = buildSlottedTagData(catalogTag);
    // Rank and identity stay with the slot; only the authored fields refresh.
    delete snapshot.rank;
    for (const hostItem of actor.items) {
      if (!DASU.taggableTypes?.includes(hostItem.type)) continue;
      const slotted = [...(hostItem.system?.tags ?? [])].filter(
        (t) => t.sourceUuid === catalogTag.uuid
      );
      for (const tag of slotted) {
        await tag.update(snapshot);
        // Replace the transferred effects with a fresh snapshot.
        await removeTagEffects(hostItem, tag.id);
        await transferTagEffects(catalogTag, hostItem, tag.id);
        refreshed++;
      }
    }
  } finally {
    reconcilingTags.delete(catalogTag.id);
  }
  return refreshed;
}

/**
 * Unslot every copy of a catalog tag from its owning actor's items. Called when
 * the catalog tag Item itself is deleted so no orphaned copies or effects remain.
 */
export async function handleCatalogTagDeleted(catalogTag) {
  const actor = catalogTag?.parent;
  if (!(actor instanceof Actor)) return;
  if (reconcilingTags.has(catalogTag.id)) return;
  reconcilingTags.add(catalogTag.id);
  try {
    for (const hostItem of actor.items) {
      if (!DASU.taggableTypes?.includes(hostItem.type)) continue;
      const slottedIds = [...(hostItem.system?.tags ?? [])]
        .filter((t) => t.sourceUuid === catalogTag.uuid)
        .map((t) => t.id);
      for (const tagId of slottedIds) {
        await unslotTag(hostItem, tagId);
      }
    }
  } finally {
    reconcilingTags.delete(catalogTag.id);
  }
}
