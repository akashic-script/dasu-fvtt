const { HandlebarsApplicationMixin } = foundry.applications.api;
const { DocumentSheetV2 } = foundry.applications.api;
import {
  onManageActiveEffect,
  prepareActiveEffectCategories,
} from '../helpers/effects.mjs';

export class DASUActorSheet extends HandlebarsApplicationMixin(
  DocumentSheetV2
) {
  static MODES = { PLAY: 1, EDIT: 2 };

  _mode = null;

  get isEditMode() {
    return this._mode === this.constructor.MODES.EDIT;
  }

  get actor() {
    return this.document;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ['dasu', 'sheet', 'actor'],
    position: { width: 600, height: 850 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      editItem: DASUActorSheet.#editItem,
      createItem: DASUActorSheet.#createItem,
      deleteItem: DASUActorSheet.#deleteItem,
      menuItem: DASUActorSheet.#menuItem,
      create: DASUActorSheet.#onEffectAction,
      edit: DASUActorSheet.#onEffectAction,
      delete: DASUActorSheet.#onEffectAction,
      toggle: DASUActorSheet.#onEffectAction,
      menu: DASUActorSheet.#onEffectAction,
      roll: DASUActorSheet.#onRoll,
      resourceStep: DASUActorSheet.#onResourceStep,
      openResourcePopover: DASUActorSheet.#onOpenResourcePopover,
      skillStep: DASUActorSheet.#onSkillStep,
      createCustomSkill: DASUActorSheet.#onCreateCustomSkill,
      deleteCustomSkill: DASUActorSheet.#onDeleteCustomSkill,
    },
  };

  /** @override */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    this._mode = options.mode ?? this._mode ?? this.constructor.MODES.PLAY;
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (partId === 'tabs' && context.tabs) {
      return { ...context, tabs: Object.values(context.tabs) };
    }
    const tab = context.tabs?.[partId];
    if (tab) context.tab = tab;
    return context;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = context.document;
    const actorData = actor.system;

    context.actor = actor;
    context.data = actor.toObject();
    context.system = actorData;
    context.flags = actor.flags;
    if (actorData.ap) context.ap = actorData.ap;
    if (actorData.sp) context.sp = actorData.sp;
    context.cssClass = [...this.options.classes, actor.type].join(' ');
    context.owner = actor.isOwner;
    context.items = Array.from(actor.items.values());
    context.items.sort((a, b) => (a.sort || 0) - (b.sort || 0));

    this._prepareItems(context);

    context.rollData = actor.getRollData();
    context.biographyHTML =
      await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        actor.system.biography ?? '',
        {
          relativeTo: actor,
          secrets: actor.isOwner,
          rollData: context.rollData,
        }
      );

    const health = actorData.health ?? {};
    const power = actorData.power ?? {};
    context.healthPercent =
      health.max > 0
        ? Math.min(100, Math.max(0, (health.value / health.max) * 100))
        : 0;
    context.powerPercent =
      power.max > 0
        ? Math.min(100, Math.max(0, (power.value / power.max) * 100))
        : 0;

    context.effects = prepareActiveEffectCategories(
      actor.allApplicableEffects()
    );

    return context;
  }

  _prepareItems(context) {
    const gear = [];
    const features = [];

    for (const i of context.items) {
      i.img = i.img || Item.DEFAULT_ICON;
      if (i.type === 'item') gear.push(i);
      else if (i.type === 'feature') features.push(i);
    }

    context.gear = gear;
    context.features = features;
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.#buildLayout();
  }

  #buildLayout() {
    const sidebar = this.element.querySelector('.sheet-sidebar');
    const tabNav = this.element.querySelector('nav.tabs');
    if (!sidebar || !tabNav) return;

    const tabSections = [
      ...this.element.querySelectorAll('.tab[data-group="primary"]'),
    ];
    const tabBody = document.createElement('div');
    tabBody.classList.add('tab-body');
    tabSections[0]?.before(tabBody);
    tabSections.forEach((s) => tabBody.append(s));
    tabBody.prepend(tabNav);

    const mainContent = document.createElement('div');
    mainContent.classList.add('main-content');
    sidebar.after(mainContent);
    mainContent.append(sidebar, tabBody);

    const sheetBody = document.createElement('div');
    sheetBody.classList.add('sheet-body');
    mainContent.after(sheetBody);
    sheetBody.append(mainContent);
  }

  _renderModeToggle() {
    const header = this.element.querySelector('.window-header');
    if (!header) return;
    let toggle = header.querySelector('.dasu-mode-toggle');
    if (this.isEditable && !toggle) {
      toggle = document.createElement('label');
      toggle.className = 'dasu-mode-toggle';
      toggle.dataset.tooltip = game.i18n.localize('DASU.Sheet.EditModeToggle');
      toggle.innerHTML = `
        <input class="dasu-mode-checkbox" type="checkbox" />
        <span class="dasu-mode-track">
          <span class="dasu-mode-thumb"><i class="fas fa-pen"></i></span>
        </span>`;
      toggle
        .querySelector('.dasu-mode-checkbox')
        .addEventListener('change', (e) => {
          const { MODES } = this.constructor;
          this._mode = e.target.checked ? MODES.EDIT : MODES.PLAY;
          this.element.classList.toggle('edit-mode', this.isEditMode);
          this.element
            .querySelectorAll(
              'input:not([type="hidden"]):not(.dasu-mode-checkbox), select'
            )
            .forEach((el) => el.toggleAttribute('readonly', !this.isEditMode));
        });
      toggle.addEventListener('dblclick', (e) => e.stopPropagation());
      toggle.addEventListener('pointerdown', (e) => e.stopPropagation());
      header.prepend(toggle);
    } else if (this.isEditable && toggle) {
      toggle.querySelector('.dasu-mode-checkbox').checked = this.isEditMode;
    } else if (!this.isEditable && toggle) {
      toggle.remove();
    }
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this._renderModeToggle();
    this.element.classList.toggle('edit-mode', this.isEditMode);
    this.element
      .querySelectorAll(
        'input:not([type="hidden"]):not(.dasu-mode-checkbox), select'
      )
      .forEach((el) => el.toggleAttribute('readonly', !this.isEditMode));

    const activeTab =
      this.tabGroups?.primary ?? this.constructor.TABS.primary.initial;
    if (
      activeTab &&
      this.element.querySelector(
        `.tab[data-group="primary"][data-tab="${activeTab}"]`
      )
    ) {
      this.changeTab(activeTab, 'primary', {
        force: true,
        updatePosition: false,
      });
    }

    if (this.actor.isOwner) {
      const handler = (ev) => this._onDragStart(ev);
      for (const li of this.element.querySelectorAll('li.item')) {
        if (li.classList.contains('inventory-header')) continue;
        li.setAttribute('draggable', true);
        li.addEventListener('dragstart', handler, false);
      }
    }

    this.element.addEventListener('wheel', (e) => {
      if (this._wheelPending || !this.isEditMode) return;
      const target = e.target;
      const delta = e.deltaY < 0 ? 1 : -1;

      const attrKey = target.name?.match(/^system\.attributes\.(\w+)\.value$/)?.[1]
        ?? (target.matches('.attribute-controls .attribute-value')
          ? target.closest('[data-attribute]')?.dataset.attribute
          : null);

      if (attrKey && (target.matches('input[data-dtype="Number"]') ? !target.readOnly : true)) {
        e.preventDefault();
        this._wheelPending = true;
        setTimeout(() => { this._wheelPending = false; }, 300);
        const current = this.actor.system.attributes[attrKey]?.value ?? 1;
        DASUActorSheet.#applyAttributeDelta(this.actor, attrKey, current, delta);
        return;
      }

      if (target.matches('input[data-dtype="Number"]') && !target.readOnly) {
        e.preventDefault();
        this._wheelPending = true;
        setTimeout(() => { this._wheelPending = false; }, 300);
        const current = parseInt(target.value) || 0;
        target.value = current + delta;
        target.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, { passive: false });

    for (const input of this.element.querySelectorAll('input.attribute-value')) {
      input.addEventListener('change', (e) => {
        const key = input.name?.match(/^system\.attributes\.(\w+)\.value$/)?.[1];
        if (!key) return;
        const next = parseInt(input.value) || 1;
        const prev = this.actor.system.attributes[key]?.value ?? 1;
        if (next <= prev) return;
        const warn = DASUActorSheet.#canRaiseAttribute(this.actor.system.attributes, this.actor.system.ap, key, next);
        if (warn) { DASUActorSheet.#warnAttribute(warn, next); e.stopImmediatePropagation(); input.value = prev; }
      }, { capture: true });
    }

    for (const input of this.element.querySelectorAll('input.skill-value')) {
      input.addEventListener('change', (e) => {
        const key = input.name?.match(/^system\.skills\.(\w+)\.value$/)?.[1];
        if (!key) return;
        const prev = this.actor.system.skills[key]?.value ?? 0;
        const next = Math.max(0, Math.min(6, parseInt(input.value) || 0));
        const delta = next - prev;
        if (delta === 0) { input.value = prev; return; }
        e.stopImmediatePropagation();
        input.value = prev;
        DASUActorSheet.#applySkillDelta(this.actor, key, prev, delta);
      }, { capture: true });
    }

    for (const row of this.element.querySelectorAll('.skill-row')) {
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const key = row.dataset.skill;
        const isCustom = !(key in CONFIG.DASU.skills);
        const items = [
          { label: game.i18n.localize('DASU.Sheet.EditItem'), icon: 'fas fa-pen', onClick: () => {} },
        ];
        if (isCustom) items.push({
          label: game.i18n.localize('DASU.Sheet.DeleteItem'),
          icon: 'fas fa-trash',
          onClick: () => {
            const raw = this.actor.toObject().system.skills ?? {};
            delete raw[key];
            this.actor.update({ 'system.skills': raw }, { diff: false, recursive: false });
          },
        });
        const menu = new foundry.applications.ux.ContextMenu(
          document.body, '#_dasu_nomatch_', items,
          { jQuery: false, fixed: true, relative: 'target' }
        );
        setTimeout(() => { ui.context = menu; menu.render(row, { event: e }); }, 0);
      });
    }
  }

  _onDragStart(event) {
    const target = event.currentTarget;
    if ('link' in event.target.dataset) return;
    let dragData;
    if (target.dataset.itemId) {
      const item = this.actor.items.get(target.dataset.itemId);
      dragData = item.toDragData();
    }
    if (dragData)
      event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
  }

  static #editItem(event, target) {
    const li = target.closest('.item');
    const item = this.actor.items.get(li.dataset.itemId);
    item.sheet.render(true);
  }

  static #menuItem(event, target) {
    const li = target.closest('.item');
    const item = this.actor.items.get(li.dataset.itemId);
    if (!item) return;
    const menu = new foundry.applications.ux.ContextMenu(
      document.body, null,
      [
        {
          label: game.i18n.localize('DASU.Sheet.DeleteItem'),
          icon: 'fas fa-trash',
          onClick: () => item.delete(),
        },
      ],
      { jQuery: false, fixed: true, relative: 'target' }
    );
    setTimeout(() => { ui.context = menu; menu.render(target); }, 0);
  }

  static async #createItem(event, target) {
    event.preventDefault();
    const type = target.dataset.type;
    const data = foundry.utils.deepClone(target.dataset);
    const itemData = { name: game.i18n.format('DOCUMENT.New', { type: type.capitalize() }), type, system: data };
    delete itemData.system['type'];
    delete itemData.system['action'];
    return await Item.create(itemData, { parent: this.actor });
  }

  static async #deleteItem(event, target) {
    const li = target.closest('.item');
    const item = this.actor.items.get(li.dataset.itemId);
    await item.delete();
    li.style.display = 'none';
    this.render();
  }

  static #onEffectAction(event, target) {
    const row = target.closest('li');
    const document =
      row.dataset.parentId === this.actor.id
        ? this.actor
        : this.actor.items.get(row.dataset.parentId);
    onManageActiveEffect(event, document, target);
  }

  static #onRoll(event, target) {
    if (this.isEditMode) return;
    event.preventDefault();
    const dataset = target.dataset;
    if (dataset.rollType === 'item') {
      const item = this.actor.items.get(target.closest('.item').dataset.itemId);
      if (item) return item.roll();
    }
    if (dataset.roll) {
      const label = dataset.label ? `${game.i18n.localize('DASU.Sheet.RollFlavorAbility')} ${dataset.label}` : '';
      const roll = new Roll(dataset.roll, this.actor.getRollData());
      roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: label,
        rollMode: game.settings.get('core', 'rollMode'),
      });
      return roll;
    }
  }

  static async #onOpenResourcePopover(event, target) {
    const { resource } = target.dataset;
    const popId = `dasu-popover-${resource}`;
    const existing = document.getElementById(popId);
    if (existing) {
      existing.remove();
      target.classList.remove('popover-open');
      return;
    }

    const val = this.actor.system[resource === 'health' ? 'health' : 'power'];
    const isHp = resource === 'health';

    const html = await foundry.applications.handlebars.renderTemplate(
      'systems/dasu/templates/actor/parts/resource-popover.hbs',
      {
        value: val.value,
        max: val.max,
        label: isHp ? 'HP' : 'WP',
        labelClass: isHp ? 'resource-label-hp' : 'resource-label-wp',
      }
    );
    const pop = Object.assign(document.createElement('div'), {
      id: popId,
      className: 'dasu-resource-popover',
      innerHTML: html,
    });

    const anchor = this.element;
    const aRect = anchor.getBoundingClientRect();
    const rRect = target.getBoundingClientRect();
    Object.assign(pop.style, {
      top: `${rRect.bottom - aRect.top + anchor.scrollTop + 2}px`,
      left: `${rRect.left - aRect.left + anchor.scrollLeft}px`,
      width: `${rRect.width}px`,
    });
    anchor.appendChild(pop);
    target.classList.add('popover-open');

    const int = (sel) => parseInt(pop.querySelector(sel).value) || 0;
    const syncSidebar = () => {
      const v = int('.pop-value');
      const m = int('.pop-max');
      if (target.querySelector('.resource-val'))
        target.querySelector('.resource-val').textContent = v;
      if (target.querySelector('.resource-max'))
        target.querySelector('.resource-max').textContent = m;
      const fill = target.querySelector('.resource-bar-fill');
      if (fill)
        fill.style.width = `${m > 0 ? Math.min(100, (v / m) * 100) : 0}%`;
    };
    const update = (key, v) => {
      this.actor.update(
        { [`system.${resource}.${key}`]: v },
        { render: false }
      );
      syncSidebar();
    };

    pop.querySelectorAll('.resource-btn').forEach((btn) =>
      btn.addEventListener('click', () => {
        const next = Math.min(
          int('.pop-max'),
          Math.max(
            0,
            int('.pop-value') +
              int('.resource-delta') * parseInt(btn.dataset.step)
          )
        );
        pop.querySelector('.pop-value').value = next;
        update('value', next);
      })
    );
    pop
      .querySelector('.pop-value')
      .addEventListener('change', (e) =>
        update('value', parseInt(e.target.value) || 0)
      );
    pop
      .querySelector('.pop-max')
      .addEventListener('change', (e) =>
        update('max', parseInt(e.target.value) || 0)
      );
    pop.querySelectorAll('input').forEach((input) =>
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        }
      })
    );

    const close = (e) => {
      if (!pop.contains(e.target) && e.target !== target) {
        pop.remove();
        target.classList.remove('popover-open');
        document.removeEventListener('pointerdown', close);
        this.render();
      }
    };
    setTimeout(() => document.addEventListener('pointerdown', close), 0);
  }

  static #onResourceStep(event, target) {
    const resource = target.dataset.resource;
    const sign = parseInt(target.dataset.step);
    const deltaInput = target
      .closest('.resource-stepper')
      .querySelector('.resource-delta');
    const delta = (parseInt(deltaInput?.value) || 1) * sign;
    const current =
      foundry.utils.getProperty(this.actor.system, `${resource}.value`) ?? 0;
    const max =
      foundry.utils.getProperty(this.actor.system, `${resource}.max`) ??
      current;
    this.actor.update({
      [`system.${resource}.value`]: Math.min(max, Math.max(0, current + delta)),
    });
  }

  static #canRaiseAttribute(attributes, ap, key, next) {
    if (next > 6) return 'DASU.Sheet.Warn.AttrCapped';
    if (next < 1) return null;
    if (ap?.value <= 0) return 'DASU.Sheet.Warn.NoAP';
    if (next >= 3) {
      const others = Object.entries(attributes).filter(([k]) => k !== key);
      if (others.filter(([, a]) => a.value >= next - 1).length < 1)
        return 'DASU.Sheet.Warn.RuleOfTwo';
    }
    return null;
  }

  static #warnAttribute(reason, next) {
    if (!reason) return;
    const msg = reason === 'DASU.Sheet.Warn.RuleOfTwo'
      ? game.i18n.format(reason, { value: next - 1 })
      : game.i18n.localize(reason);
    ui.notifications.warn(msg);
  }

  static #applyAttributeDelta(actor, key, current, delta) {
    const next = current + delta;
    if (delta < 0 && next < 1) return;
    if (delta > 0) {
      const warn = DASUActorSheet.#canRaiseAttribute(actor.system.attributes, actor.system.ap, key, next);
      if (warn) { DASUActorSheet.#warnAttribute(warn, next); return; }
    }
    actor.update({ [`system.attributes.${key}.value`]: next });
  }

  static #canRaiseSkill(skills, sp, key, next) {
    if (next > 6) return 'DASU.Sheet.Warn.SkillCapped';
    if (next < 0) return null;
    const cost = next; // cost to go from (next-1) to next is next SP
    if (sp?.value < cost) return 'DASU.Sheet.Warn.NoSP';
    return null;
  }

  static #applySkillDelta(actor, key, current, delta) {
    const next = current + delta;
    if (delta < 0 && next < 0) return;
    if (delta > 0) {
      const warn = DASUActorSheet.#canRaiseSkill(actor.system.skills, actor.system.sp, key, next);
      if (warn) { ui.notifications.warn(game.i18n.localize(warn)); return; }
    }
    actor.update({ [`system.skills.${key}.value`]: next });
  }

  static #onSkillStep(event, target) {
    const { skill, step } = target.dataset;
    const current = this.actor.system.skills[skill]?.value ?? 0;
    DASUActorSheet.#applySkillDelta(this.actor, skill, current, parseInt(step));
  }

  static #onCreateCustomSkill() {
    const id = foundry.utils.randomID(8);
    this.actor.update({ [`system.skills.${id}`]: { value: 0, customName: '' } });
  }

  static #onDeleteCustomSkill(event, target) {
    const { id } = target.dataset;
    const skills = this.actor.toObject().system.skills ?? {};
    delete skills[id];
    this.actor.update({ 'system.skills': skills }, { diff: false, recursive: false });
  }
}
