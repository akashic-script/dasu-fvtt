import DASUItemBase from './item-base.mjs';
import { BaseTag } from './tags/_module.mjs';

/**
 * Data model for `tag` Items.
 *
 * Schema fields are shared with BaseTag via BaseTag.sharedTagFields() to avoid
 * duplication. Validation logic is shared via BaseTag.checkValidForHost().
 */
export default class DASUTag extends DASUItemBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      ...BaseTag.sharedTagFields(),
    };
  }

  isValidForHost(hostItem) {
    return BaseTag.checkValidForHost(this, hostItem);
  }
}
