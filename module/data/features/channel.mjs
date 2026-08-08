import DASUFeature from '../feature.mjs';
import { toggleStockChanneled } from '../../helpers/daemon-stock.mjs';

// Channeler mechanic as a feature sub-type. Per-daemon channel state stays on
// stock[].channeled; the exclusive toggle reuses toggleStockChanneled.
export default class DASUChannelFeature extends DASUFeature {
  static TYPE = 'channel';

  renderStockRow(entry) {
    const on = !!entry?.channeled;
    const cls = on ? ' cell-item-controls__control--active' : '';
    const label = game.i18n.localize(
      on ? 'DASU.Stock.StopChannel' : 'DASU.Stock.Channel'
    );
    return `<a class="cell-item-controls__control${cls}" data-action="featureStock" data-feature-type="channel" data-tooltip="${label}"><i class="fa-solid fa-hand-sparkles"></i></a>`;
  }

  async onStockClick(actor, entry) {
    await toggleStockChanneled(actor, entry.uuid);
  }

  rowFlags(entry) {
    return { channeled: !!entry?.channeled };
  }
}
