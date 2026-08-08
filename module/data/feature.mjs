import DASUItemBase from './item-base.mjs';

export default class DASUFeature extends DASUItemBase {
  static TYPE = '';

  prepareActor(_actor) {}

  renderStockRow(_entry, _actor) {
    return '';
  }

  async onStockClick(_actor, _entry, _index, _event) {}

  rowFlags(_entry, _actor) {
    return {};
  }

  actorResources() {
    return {};
  }
}
