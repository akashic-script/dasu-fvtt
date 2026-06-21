/**
 * Extend the base Actor document.
 * @extends {Actor}
 */
export class DASUActor extends Actor {
  /** @override */
  getRollData() {
    return { ...super.getRollData(), ...(this.system.getRollData?.() ?? {}) };
  }

  /** @override */
  async _onUpdate(changed, options, userId) {
    await super._onUpdate(changed, options, userId);
    if (foundry.utils.hasProperty(changed, 'system.level')) {
      await this.applySchemaUpgrades();
    }
  }

  /** @override */
  async _onUpdateEmbeddedDocuments(embeddedName, documents, result, options, userId) {
    await super._onUpdateEmbeddedDocuments(embeddedName, documents, result, options, userId);
    if (embeddedName === 'Item') {
      const touchesSchema = documents.some(
        (d) => d.type === 'class' || d.type === 'schema' || d.flags?.dasu?.slotCopy
      );
      if (touchesSchema) await this.applySchemaUpgrades();
    }
  }

  async applySchemaUpgrades() {
    const cls = this.itemTypes?.class?.[0] ?? null;
    if (!cls) return;

    const currentLevel = this.system.level ?? 1;
    const advancements = [...cls.system.advancements];

    const slotAdvs = advancements
      .filter((a) => a.type === 'schemaSlot')
      .sort((a, b) => a.level - b.level || a.sort - b.sort);

    const upgradesByAdvId = {};
    for (const adv of advancements) {
      if (adv.type !== 'schemaUpgrade' || adv.level > currentLevel || !adv.targetAdvancementId) continue;
      const { targetAdvancementId: id, upgradeTo: tier } = adv;
      if (!upgradesByAdvId[id] || tier > upgradesByAdvId[id]) upgradesByAdvId[id] = tier;
    }

    const updates = [];
    for (const slotAdv of slotAdvs) {
      const targetLevel = upgradesByAdvId[slotAdv.id] ?? 1;
      const choice = slotAdv.getChoice(this);
      const item = choice?.itemId ? this.items.get(choice.itemId) : null;
      if (!item || item.type !== 'schema') continue;
      if (item.system.level !== targetLevel) updates.push({ _id: item.id, 'system.level': targetLevel });
    }

    if (updates.length) await this.updateEmbeddedDocuments('Item', updates);
  }
}
