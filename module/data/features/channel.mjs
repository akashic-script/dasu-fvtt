import DASUFeature from '../feature.mjs';

// Channeler mechanic as a feature sub-type. Per-daemon state lives on
// stock[].featureData.channel.
export default class DASUChannelFeature extends DASUFeature {
  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();
    schema.exclusive = new fields.BooleanField({ initial: true });
    return schema;
  }

  renderStockRow(entry) {
    const on = entry?.featureData?.channel?.channeled ?? false;
    const cls = on ? ' cell-item-controls__control--active' : '';
    const label = game.i18n.localize(
      on ? 'DASU.Stock.StopChannel' : 'DASU.Stock.Channel'
    );
    return `<a class="cell-item-controls__control${cls}" data-action="featureStock" data-feature-type="channel" data-tooltip="${label}"><i class="fa-solid fa-hand-sparkles"></i></a>`;
  }

  async onStockClick(actor, entry, index) {
    const stock = foundry.utils.deepClone(actor.system.stock ?? []);
    const e = stock[index];
    if (!e) return;
    const next = !e.featureData?.channel?.channeled;
    if (this.exclusive && next) {
      for (const s of stock) {
        if (s.featureData?.channel) s.featureData.channel.channeled = false;
      }
    }
    e.featureData = { ...(e.featureData ?? {}), channel: { channeled: next } };
    if (next) e.active = true;
    await actor.update({ 'system.stock': stock });
  }

  rowFlags(entry) {
    return { channeled: entry?.featureData?.channel?.channeled ?? false };
  }
}
