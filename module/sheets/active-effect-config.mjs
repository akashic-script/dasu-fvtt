import { SYSTEM } from '../helpers/config.mjs';
import {
  statusIdOf,
  stacksOf,
  maxStacksOf,
  scaleWithStacksOf,
} from '../helpers/status-effects.mjs';

const { ActiveEffectConfig } = foundry.applications.sheets;

/**
 * ActiveEffect config sheet with an extra "Stacks" tab on all effects.
 * Exposes the current stack count, max-stacks override, caster attribute cap,
 * and per-stack auto-scale toggle stored under `flags.dasu.*`.
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

  /** @override Always show the Stacks part. */
  _configureRenderParts(options) {
    return super._configureRenderParts(options);
  }

  /** @override Always show the Stacks tab. */
  _prepareTabs(group) {
    return super._prepareTabs(group);
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
