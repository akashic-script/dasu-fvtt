import { SYSTEM } from '../helpers/config.mjs';
import {
  isStackable,
  statusIdOf,
  stacksOf,
  maxStacksOf,
  scaleWithStacksOf,
} from '../helpers/status-effects.mjs';

const { ActiveEffectConfig } = foundry.applications.sheets;

/**
 * ActiveEffect config sheet with an extra "Stacks" tab for stackable status
 * effects. The tab exposes the current stack count, a max-stacks override, the
 * caster attribute the cap derives from, and a per-stack auto-scale toggle -
 * all stored under `flags.dasu.*` and consumed by the status-effects helpers.
 *
 * The tab is only shown for effects that represent a stackable status; for any
 * other ActiveEffect this behaves exactly like the core config.
 */
export class DASUActiveEffectConfig extends ActiveEffectConfig {
  static PARTS = (() => {
    const parts = { ...super.PARTS };
    const stacks = {
      stacks: { template: `systems/${SYSTEM}/templates/effect/stacks.hbs` },
    };
    // Keep our part just before the footer if one exists, else append.
    if (parts.footer) {
      const { footer, ...rest } = parts;
      return { ...rest, ...stacks, footer };
    }
    return { ...parts, ...stacks };
  })();

  static TABS = (() => {
    const tabs = foundry.utils.deepClone(super.TABS ?? {});
    const sheet = (tabs.sheet ??= { tabs: [], initial: 'details' });
    sheet.tabs = [
      ...(sheet.tabs ?? []),
      {
        id: 'stacks',
        icon: 'fa-solid fa-layer-group',
        label: 'DASU.Status.StacksTab',
      },
    ];
    return tabs;
  })();

  /** True when the edited effect is a stackable status. */
  get _isStackable() {
    return isStackable(statusIdOf(this.document));
  }

  /** @override Drop the Stacks part entirely for non-stackable effects. */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    if (!this._isStackable) delete parts.stacks;
    return parts;
  }

  /** @override Hide the Stacks tab control for non-stackable effects. */
  _prepareTabs(group) {
    const tabs = super._prepareTabs(group);
    if (!this._isStackable) delete tabs.stacks;
    return tabs;
  }

  /** @override Provide stacks context to the Stacks part. */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (partId !== 'stacks') return context;

    const effect = this.document;
    const override = effect.getFlag(SYSTEM, 'maxStacksOverride');
    context.stacks = {
      current: stacksOf(effect),
      max: maxStacksOf(effect),
      override: Number.isFinite(override) ? override : null,
      attr: effect.getFlag(SYSTEM, 'maxStacksAttr') ?? '',
      scaleWithStacks: scaleWithStacksOf(effect),
      attrChoices: {
        '': game.i18n.localize('DASU.Status.StackAttrNone'),
        ...CONFIG.DASU.attributeAbbreviations,
      },
    };
    return context;
  }
}
