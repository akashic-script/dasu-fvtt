/**
 * Persists fieldset tab/split state in document flags.
 * Fieldsets without a registered id fall back to DOM-only behavior.
 *
 *   const manager = new FieldsetStateManager([
 *     { id: 'identity-editor', defaultPanel: 'biography', panels: ['biography', 'notes'] },
 *     { id: 'schema-levels', defaultPanel: 'level1', defaultSplit: true, panels: ['level1', 'level2', 'level3'] },
 *   ]);
 *
 *   // _prepareContext:
 *   context.fieldsets = manager.prepareContext(document);
 *
 *   // action handlers:
 *   await manager.onTab(event, target, this.document);
 *   await manager.onSplit(event, target, this.document);
 */
export class FieldsetStateManager {
  #configs = new Map();

  constructor(configs = []) {
    for (const cfg of configs) {
      this.#configs.set(cfg.id, {
        defaultPanel: cfg.defaultPanel ?? '',
        defaultSplit: cfg.defaultSplit ?? false,
        defaultSplitDirection: cfg.defaultSplitDirection ?? 'column',
        panels: cfg.panels ?? [],
      });
    }
  }

  /** Per-panel state lives under `panels`, reach it via `{{lookup panels.level1 "activeClass"}}`. */
  prepareContext(document) {
    const stored = document.getFlag('dasu', 'fieldsets') ?? {};
    const context = {};

    for (const [id, cfg] of this.#configs) {
      const state = stored[id] ?? {};
      const activePanel = state.activePanel ?? cfg.defaultPanel;
      const split = state.split ?? cfg.defaultSplit;
      const splitDirection = state.splitDirection ?? cfg.defaultSplitDirection;

      const panels = Object.fromEntries(cfg.panels.map((p) => [p, {
        activeClass: activePanel === p ? 'active' : '',
        hidden: !split && activePanel !== p ? 'hidden' : '',
      }]));

      context[id] = {
        activePanel,
        split,
        splitDirection,
        splitClass: split ? 'dasu-fieldset--split' : '',
        splitBtnActiveClass: split ? 'active' : '',
        panels,
      };
    }

    return context;
  }

  async onTab(event, target, document) {
    const { fieldset, id } = this.#resolve(target);
    if (!fieldset) return;
    if (!id) return this.#domOnlyTab(fieldset, target);
    await this.#saveState(document, id, { activePanel: target.dataset.panel });
  }

  async onSplit(event, target, document) {
    const { fieldset, id } = this.#resolve(target);
    if (!fieldset) return;
    if (!id) return this.#domOnlySplit(fieldset, target);
    await this.#saveState(document, id, {
      split: !target.classList.contains('active'),
      splitDirection: target.dataset.direction ?? 'column',
    });
  }

  #resolve(target) {
    const fieldset = target.closest('.dasu-fieldset--tabbed');
    const id = fieldset?.dataset.fieldset;
    return { fieldset, id: id && this.#configs.has(id) ? id : null };
  }

  async #saveState(document, id, patch) {
    const current = document.getFlag('dasu', `fieldsets.${id}`) ?? {};
    await document.setFlag('dasu', `fieldsets.${id}`, { ...current, ...patch });
  }

  #domOnlyTab(fieldset, target) {
    const panel = target.dataset.panel;
    fieldset.querySelectorAll('.dasu-fieldset__tab').forEach((t) => t.classList.remove('active'));
    fieldset.querySelectorAll('.dasu-fieldset__panel').forEach((p) => { p.hidden = p.dataset.panel !== panel; });
    target.classList.add('active');
  }

  #domOnlySplit(fieldset, target) {
    const alreadyActive = target.classList.contains('active');
    fieldset.querySelectorAll('.dasu-fieldset__split-btn').forEach((btn) => btn.classList.remove('active'));
    if (alreadyActive) {
      fieldset.classList.remove('dasu-fieldset--split');
      const activePanel = fieldset.querySelector('.dasu-fieldset__tab.active')?.dataset.panel;
      fieldset.querySelectorAll('.dasu-fieldset__panel').forEach((p) => { p.hidden = p.dataset.panel !== activePanel; });
    } else {
      target.classList.add('active');
      fieldset.dataset.splitDirection = target.dataset.direction ?? 'column';
      fieldset.classList.add('dasu-fieldset--split');
      fieldset.querySelectorAll('.dasu-fieldset__panel').forEach((p) => { p.hidden = false; });
    }
  }
}
