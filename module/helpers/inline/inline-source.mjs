import { SYSTEM } from '../config.mjs';
import { Flags } from '../flags.mjs';

/**
 * Where an inline reference came from (actor/item/effect), for caster
 * attribution and request-card naming. Serializable onto chat-message flags.
 */
export class InlineSourceInfo {
  constructor(name, actorUuid = null, itemUuid = null, effectUuid = null) {
    this.name = name;
    this.actorUuid = actorUuid;
    this.itemUuid = itemUuid;
    this.effectUuid = effectUuid;
  }

  static fromObject(obj) {
    if (obj instanceof InlineSourceInfo) return obj;
    return new InlineSourceInfo(
      obj?.name ?? 'Unknown',
      obj?.actorUuid ?? null,
      obj?.itemUuid ?? null,
      obj?.effectUuid ?? null
    );
  }

  /** Resolve the source from an enriched element's parent document. */
  static determine(document, element) {
    if (document instanceof Actor) {
      let name = document.name;
      let itemUuid = null;
      const itemId = element?.closest('[data-item-id]')?.dataset.itemId;
      const item = itemId ? document.items.get(itemId) : null;
      if (item) {
        itemUuid = item.uuid;
        name = item.name;
      }
      return new InlineSourceInfo(name, document.uuid, itemUuid);
    }
    if (document instanceof Item) {
      const actorUuid = document.isEmbedded ? document.actor.uuid : null;
      return new InlineSourceInfo(document.name, actorUuid, document.uuid);
    }
    if (document instanceof ChatMessage) {
      return InlineSourceInfo.fromChatMessage(document);
    }
    return InlineSourceInfo.none;
  }

  /** Build from a chat message's speaker + item/check flags. */
  static fromChatMessage(message) {
    let actorUuid = null;
    let name = message.speaker?.alias ?? 'Unknown';
    const speaker = ChatMessage.getSpeakerActor(message.speaker);
    if (speaker) {
      actorUuid = speaker.uuid;
      name = speaker.name;
    }
    let itemUuid = message.getFlag(SYSTEM, Flags.ChatMessage.Item) ?? null;
    const check = message.getFlag(SYSTEM, Flags.ChatMessage.Check);
    if (!itemUuid && check?.itemUuid) itemUuid = check.itemUuid;
    if (check?.itemName) name = check.itemName;
    return new InlineSourceInfo(name, actorUuid, itemUuid);
  }

  resolveActor() {
    return this.actorUuid ? fromUuidSync(this.actorUuid) : null;
  }

  resolveItem() {
    return this.itemUuid ? fromUuidSync(this.itemUuid) : null;
  }

  /** Roll data for evaluating inline amount expressions (@pow.value, etc.). */
  getRollData() {
    const item = this.resolveItem();
    if (item?.getRollData) return item.getRollData();
    const actor = this.resolveActor() ?? InlineSourceInfo._selectedActor();
    return actor?.getRollData?.() ?? {};
  }

  /** Fallback roll-data source when no actorUuid is set (e.g. GM-typed chat). */
  static _selectedActor() {
    return canvas?.tokens?.controlled?.[0]?.actor ?? null;
  }

  static none = Object.freeze(new InlineSourceInfo('Unknown'));
}
