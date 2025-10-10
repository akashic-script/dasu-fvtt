/**
 * Extended Active Effect document for the DASU system
 * Implements conditional activation based on item equipment status
 */
export class DASUActiveEffect extends ActiveEffect {
  /**
   * Override isSuppressed to implement conditional activation logic
   * @returns {boolean} Whether the effect should be suppressed
   * @override
   */
  get isSuppressed() {
    // First check base suppression logic
    if (super.isSuppressed) return true;

    // Check if this effect should be suppressed based on equipment status
    if (this._shouldSuppressForEquipment()) {
      return true;
    }

    return false;
  }

  /**
   * Check if this effect should be suppressed based on item equipment status
   * Supports any equippable item type by checking the actor's equipped slots
   * @returns {boolean} True if effect should be suppressed
   * @private
   */
  _shouldSuppressForEquipment() {
    // Only check for transferred effects from items
    if (!this.transfer || !this.parent) {
      return false;
    }

    // Get the target actor
    const actor = this.target;
    if (!(actor instanceof Actor)) {
      return false;
    }

    const item = this.parent;
    const itemType = item.type;

    // Check if this item type is equippable by checking for a corresponding
    // isItemEquipped method on the actor
    const checkMethod = `is${
      itemType.charAt(0).toUpperCase() + itemType.slice(1)
    }Equipped`;

    if (typeof actor[checkMethod] === 'function') {
      // Item type has an equipment system - check if equipped
      return !actor[checkMethod](item.id);
    }

    // Item type is not equippable, don't suppress
    return false;
  }
}
