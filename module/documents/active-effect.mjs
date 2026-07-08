/** AE change values support `@target.*`, `@source.*`, `@item.*`, and arithmetic. */
export class DASUActiveEffect extends ActiveEffect {
  /**
   * @override
   * A party-aura mirror (`flags.dasu.auraOrigin`) is managed by the party
   * effect and may only be removed via that source; block direct deletion
   * from a member's sheet unless our own teardown passes `dasuForce`.
   */
  async _preDelete(options, user) {
    if (this.getFlag('dasu', 'auraOrigin') && !options.dasuForce) {
      ui.notifications?.warn(game.i18n.localize('DASU.Party.AuraMirrorLocked'));
      return false;
    }
    return super._preDelete(options, user);
  }

  /** @override */
  apply(target, change) {
    if (
      change.value &&
      typeof change.value === 'string' &&
      change.value.includes('@')
    ) {
      try {
        const sourceActor = this.origin
          ? fromUuidSync(this.origin)?.actor ?? fromUuidSync(this.origin)
          : null;
        const parentItem = this.parent instanceof Item ? this.parent : null;
        const rollData = {
          target: target.getRollData?.() ?? {},
          source:
            sourceActor instanceof Actor
              ? sourceActor.getRollData?.() ?? {}
              : {},
          item: parentItem ? foundry.utils.deepClone(parentItem.system) : {},
        };
        const resolved = Roll.replaceFormulaData(change.value, rollData);
        if (/^[\d\s+\-*/().]+$/.test(resolved.trim())) {
          const value = Roll.safeEval(resolved);
          if (Number.isFinite(value))
            change = { ...change, value: String(value) };
        } else {
          change = { ...change, value: resolved };
        }
      } catch (err) {
        console.warn(
          `DASU | AE change value "${change.value}" failed to evaluate on ${target?.name}`,
          err
        );
      }
    }
    return super.apply(target, change);
  }
}
