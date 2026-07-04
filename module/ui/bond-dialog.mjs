import { SYSTEM } from '../helpers/config.mjs';

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const systemTpl = (path) => `systems/${SYSTEM}/templates/${path}.hbs`;

const RANK_KEYS = ['rank1', 'rank2', 'rank3'];

export class DASUBondDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {Actor} */
  #actor;
  /** @type {Item} */
  #item;
  /** @type {string} currently selected rank key */
  #rankKey;

  constructor(actor, item, options = {}) {
    super(options);
    this.#actor = actor;
    this.#item = item;
    this.#rankKey = DASUBondDialog.#defaultRankKey(item);
  }

  static DEFAULT_OPTIONS = {
    id: 'dasu-bond-dialog',
    tag: 'div',
    window: {
      title: 'DASU.Dialog.Bond.Title',
      icon: 'fas fa-heart',
      resizable: false,
    },
    position: { width: 320, height: 'auto' },
    actions: {
      use: DASUBondDialog.#onUse,
      cancel: DASUBondDialog.#onCancel,
    },
  };

  static PARTS = {
    form: { template: systemTpl('dialog/bond-dialog') },
  };

  get title() {
    return game.i18n.localize('DASU.Dialog.Bond.Title');
  }

  /** Highest unlocked rank, or the first rank if none are unlocked yet. */
  static #defaultRankKey(item) {
    const sys = item.system ?? {};
    const affinity = sys.affinity ?? 0;
    const unlocked = RANK_KEYS.filter(
      (k) => affinity >= (sys[k]?.threshold ?? 0)
    );
    return unlocked.at(-1) ?? RANK_KEYS[0];
  }

  async _prepareContext() {
    const sys = this.#item.system ?? {};
    const affinity = sys.affinity ?? 0;

    const ranks = RANK_KEYS.map((key, i) => ({
      key,
      label:
        sys[key]?.name ||
        game.i18n.format('DASU.Dialog.Bond.RankN', { n: i + 1 }),
      selected: key === this.#rankKey,
      unlocked: affinity >= (sys[key]?.threshold ?? 0),
    })).filter((r) => r.unlocked);

    const selRank = sys[this.#rankKey] ?? {};
    const effect = selRank.effectUuid
      ? await fromUuid(selRank.effectUuid)
      : null;
    const effectDescription = effect
      ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(
          effect.description ?? '',
          { relativeTo: effect, secrets: false }
        )
      : '';
    const abilityType = selRank.abilityType ?? 'passive';
    const abilityTypeLabel = game.i18n.localize(
      `DASU.Bond.Ability.${abilityType.replace(/^./, (c) => c.toUpperCase())}`
    );

    return {
      itemName: this.#item.name,
      showRanks: ranks.length > 0,
      ranks,
      hasSelection: !!sys[this.#rankKey],
      abilityName: effect?.name ?? '',
      abilityTypeLabel,
      effectDescription,
    };
  }

  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);
    htmlElement
      .querySelector('[name="rank"]')
      ?.addEventListener('change', (event) => {
        this.#rankKey = event.target.value;
        this.render();
      });
  }

  static async #onUse() {
    const checks = game.dasu?.Checks;
    if (!checks) return this.close();

    const form = this.element.querySelector('form');
    const rankKey = form.querySelector('[name="rank"]')?.value || this.#rankKey;

    await checks.displayCheck(this.#actor, this.#item, (check) => {
      check.additionalData.bondRank = rankKey;
    });

    this.close();
  }

  static #onCancel() {
    this.close();
  }

  static open(actor, item) {
    return new DASUBondDialog(actor, item).render(true);
  }
}
