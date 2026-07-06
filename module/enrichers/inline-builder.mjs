/**
 * Guided inline-command builder. Adds a pen-nib dropdown to the ProseMirror
 * toolbar; each entry opens a DialogV2 form that composes an `@NAME[...]`
 * reference with a live preview and inserts it at the cursor.
 */

const { DialogV2 } = foundry.applications.api;

const TYPES = ['DMG', 'RESOURCE', 'EFFECT'];

/** Options for the type-specific selects, sourced from system config. */
function fieldOptions() {
  const damageTypes = Object.entries(CONFIG.DASU.damageTypes ?? {}).map(
    ([key, label]) => ({ key, label: game.i18n.localize(label) })
  );
  const statuses = Object.entries(CONFIG.DASU.statusEffectIndex ?? {}).map(
    ([key, def]) => ({ key, label: game.i18n.localize(def.name ?? key) })
  );
  return { damageTypes, statuses };
}

/** Render a `<datalist>` element with roll-data variable suggestions. */
function amountDatalist(id) {
  const opts = (CONFIG.DASU.inlineAmountVars ?? [])
    .map((v) => `<option value="${v}"></option>`)
    .join('');
  return `<datalist id="${id}">${opts}</datalist>`;
}

/** Build the composed reference string from the current form values. */
function compose(form) {
  const type = form.elements.commandType.value;
  const label = form.elements.label.value.trim();
  const suffix = label ? `{${label}}` : '';
  const val = (name) => form.elements[name]?.value.trim() ?? '';

  switch (type) {
    case 'DMG': {
      const amount = val('dmgAmount') || '0';
      const dtype = val('dmgType');
      const wp = form.elements.dmgWp?.checked ? '|wp|' : '';
      return `@DMG[${amount} ${dtype}${wp}]${suffix}`;
    }
    case 'RESOURCE': {
      const amount = val('resAmount') || '0';
      const res = val('resResource');
      const op = val('resOp');
      return `@RESOURCE[${amount} ${res} ${op}]${suffix}`;
    }
    case 'EFFECT': {
      const dur = val('effectDuration');
      // The reference is either a chosen status id or a pasted effect UUID.
      const ref =
        val('effectKind') === 'status'
          ? val('effectStatus')
          : val('effectUuid');
      return `@EFFECT[${ref}${dur ? ` ${dur}` : ''}]${suffix}`;
    }
    default:
      return '';
  }
}

/** A duration `<select>` (blank / turns 1-5 / rounds 1-5) for a named field. */
function durationField(name) {
  const opts = ['', '1t', '2t', '3t', '4t', '5t', '1r', '2r', '3r', '4r', '5r']
    .map(
      (v) =>
        `<option value="${v}">${
          v || game.i18n.localize('DASU.Inline.Builder.NoDuration')
        }</option>`
    )
    .join('');
  return `
    <div class="form-group">
      <label>${game.i18n.localize('DASU.Inline.Builder.Duration')}</label>
      <select name="${name}">${opts}</select>
    </div>`;
}

/** The dialog's form markup. `initialType` selects the starting command. */
function formHtml(initialType) {
  const { damageTypes, statuses } = fieldOptions();
  const opt = (list, sel) =>
    list
      .map(
        (o) =>
          `<option value="${o.key}"${o.key === sel ? ' selected' : ''}>${
            o.label
          }</option>`
      )
      .join('');
  const typeOpts = TYPES.map(
    (t) =>
      `<option value="${t}"${
        t === initialType ? ' selected' : ''
      }>@${t}</option>`
  ).join('');

  return `
    <div class="dasu-inline-builder">
      <div class="form-group">
        <label>${game.i18n.localize('DASU.Inline.Builder.Command')}</label>
        <select name="commandType">${typeOpts}</select>
      </div>

      ${amountDatalist('dasu-amount-vars')}
      <fieldset data-type="DMG">
        <div class="form-group">
          <label>${game.i18n.localize('DASU.Inline.Builder.Amount')}</label>
          <input type="text" name="dmgAmount" list="dasu-amount-vars" placeholder="8 or @attributes.pow.value" />
        </div>
        <div class="form-group">
          <label>${game.i18n.localize('DASU.Inline.Builder.DamageType')}</label>
          <select name="dmgType">${opt(damageTypes, 'physical')}</select>
        </div>
        <div class="form-group">
          <label>${game.i18n.localize('DASU.Inline.Builder.TargetWp')}</label>
          <input type="checkbox" name="dmgWp" />
        </div>
      </fieldset>

      <fieldset data-type="RESOURCE" hidden>
        <div class="form-group">
          <label>${game.i18n.localize('DASU.Inline.Builder.Amount')}</label>
          <input type="text" name="resAmount" list="dasu-amount-vars" placeholder="3 or @lvl" />
        </div>
        <div class="form-group">
          <label>${game.i18n.localize('DASU.Inline.Builder.Resource')}</label>
          <select name="resResource"><option value="hp">HP</option><option value="wp">WP</option></select>
        </div>
        <div class="form-group">
          <label>${game.i18n.localize('DASU.Inline.Builder.Operation')}</label>
          <select name="resOp"><option value="cost">${game.i18n.localize(
            'DASU.Inline.Builder.Cost'
          )}</option><option value="heal">${game.i18n.localize(
    'DASU.Inline.Builder.Heal'
  )}</option></select>
        </div>
      </fieldset>

      <fieldset data-type="EFFECT" hidden>
        <div class="form-group">
          <label>${game.i18n.localize('DASU.Inline.Builder.EffectKind')}</label>
          <select name="effectKind">
            <option value="status">${game.i18n.localize(
              'DASU.Inline.Builder.KindStatus'
            )}</option>
            <option value="uuid">${game.i18n.localize(
              'DASU.Inline.Builder.KindUuid'
            )}</option>
          </select>
        </div>
        <div class="form-group" data-effect-kind="status">
          <label>${game.i18n.localize('DASU.Inline.Builder.Status')}</label>
          <select name="effectStatus">${opt(
            statuses,
            statuses[0]?.key
          )}</select>
        </div>
        <div class="form-group" data-effect-kind="uuid" hidden>
          <label>${game.i18n.localize('DASU.Inline.Builder.EffectUuid')}</label>
          <input type="text" name="effectUuid" placeholder="Compendium.dasu.effects.Item.abc123" />
        </div>
        ${durationField('effectDuration')}
      </fieldset>

      <div class="form-group">
        <label>${game.i18n.localize('DASU.Inline.Builder.Label')}</label>
        <input type="text" name="label" placeholder="${game.i18n.localize(
          'DASU.Inline.Builder.LabelHint'
        )}" />
      </div>

      <div class="form-group dasu-inline-builder__preview">
        <label>${game.i18n.localize('DASU.Inline.Builder.Preview')}</label>
        <code data-preview>@${initialType}[...]</code>
      </div>
    </div>`;
}

function activate(dialog) {
  const container = dialog.element.querySelector('.dasu-inline-builder');
  const form = dialog.element.querySelector('form');
  if (!container || !form) return;
  const preview = container.querySelector('[data-preview]');
  const fieldsets = container.querySelectorAll('fieldset[data-type]');
  const effectKindGroups = container.querySelectorAll('[data-effect-kind]');

  const sync = () => {
    const type = form.elements.commandType.value;
    for (const fs of fieldsets) fs.hidden = fs.dataset.type !== type;
    const effectKind = form.elements.effectKind?.value;
    for (const g of effectKindGroups) {
      g.hidden = g.dataset.effectKind !== effectKind;
    }
    preview.textContent = compose(form) || `@${type}[...]`;
  };

  form.addEventListener('input', sync);
  form.addEventListener('change', sync);
  sync();
}

/**
 * Open the builder dialog for `initialType` and insert the result at the cursor.
 * @param {EditorView} view  the ProseMirror editor view.
 * @param {string} initialType  starting command (DMG/RESOURCE/EFFECT).
 */
async function openDialog(view, initialType) {
  const result = await DialogV2.wait({
    window: { title: game.i18n.localize('DASU.Inline.Builder.Title') },
    content: formHtml(initialType),
    render: (event, dialog) => activate(dialog),
    buttons: [
      {
        action: 'insert',
        label: game.i18n.localize('DASU.Inline.Builder.Insert'),
        default: true,
        callback: (event, button) => compose(button.form),
      },
      { action: 'cancel', label: game.i18n.localize('Cancel') },
    ],
    rejectClose: false,
  }).catch(() => null);

  if (!result || result === 'cancel') return;
  view.dispatch(view.state.tr.insertText(result));
  view.focus();
}

/** Register the ProseMirror toolbar dropdown. Call once at init. */
export function initializeInlineBuilder() {
  Hooks.on('getProseMirrorMenuDropDowns', (menu, config) => {
    const dasuInline = {
      title: game.i18n.localize('DASU.Inline.Builder.Menu'),
      cssClass: 'dasu-inline',
      icon: '<i class="fa-solid fa-pen-nib"></i>',
      entries: TYPES.map((type) => ({
        action: `dasuInline${type}`,
        title: `@${type}`,
        cmd: (state, dispatch, view) => {
          openDialog(view ?? menu.view, type);
          return true;
        },
      })),
    };

    // Dropdowns render in key order; re-key config so ours sits right after
    // `format` (the Paragraph menu) rather than after all core dropdowns.
    const entries = Object.entries(config);
    for (const key of Object.keys(config)) delete config[key];
    for (const [key, value] of entries) {
      config[key] = value;
      if (key === 'format') config.dasuInline = dasuInline;
    }
    if (!config.dasuInline) config.dasuInline = dasuInline;
  });
}
