import { WeaponTableRenderer } from './weapon-table-renderer.mjs';
import { AbilityTableRenderer } from './ability-table-renderer.mjs';
import { TacticTableRenderer } from './tactic-table-renderer.mjs';
import { ArchetypeTableRenderer } from './archetype-table-renderer.mjs';
import { SubtypeTableRenderer } from './subtype-table-renderer.mjs';

export class DaemonTables {
  #uuid;
  weapon;
  ability;
  tactic;
  archetype;
  subtype;

  constructor(daemonUuid) {
    this.#uuid = daemonUuid;
    const getDaemon = () => fromUuidSync(daemonUuid);
    const resolveItem = (target) => {
      const id = target.closest('[data-item-id]')?.dataset?.itemId;
      return getDaemon()?.items?.get(id) ?? null;
    };
    const overrides = {
      actions: {
        rollItem: (e, t) => resolveItem(t)?.roll?.(),
        editItem: (e, t) => resolveItem(t)?.sheet?.render(true),
        deleteItem: () => {},
        menuItem: (e, t) => {
          const item = resolveItem(t);
          if (!item) return;
          ui.context?.close();
          const menu = new foundry.applications.ux.ContextMenu(
            document.body,
            null,
            [
              {
                label: game.i18n.localize('DASU.Sheet.EditItem'),
                icon: 'fas fa-edit',
                onClick: () => item.sheet.render(true),
              },
            ],
            { jQuery: false, fixed: true, relative: 'target' }
          );
          setTimeout(() => {
            ui.context = menu;
            menu.render(t, { event: e });
          }, 0);
        },
      },
    };
    this.weapon = new WeaponTableRenderer(overrides);
    this.ability = new AbilityTableRenderer(overrides);
    this.tactic = new TacticTableRenderer(overrides);
    this.archetype = new ArchetypeTableRenderer(overrides);
    this.subtype = new SubtypeTableRenderer(overrides);
  }

  activateListeners(app) {
    this.weapon.activateListeners(app);
    this.ability.activateListeners(app);
    this.tactic.activateListeners(app);
    this.archetype.activateListeners(app);
    this.subtype.activateListeners(app);
  }

  async render() {
    const daemon = fromUuidSync(this.#uuid);
    if (!daemon) return null;
    const [weapon, ability, tactic] = await Promise.all([
      this.weapon.renderTable(daemon),
      this.ability.renderTable(daemon),
      this.tactic.renderTable(daemon),
    ]);
    return { uuid: this.#uuid, name: daemon.name, img: daemon.img, weapon, ability, tactic };
  }

  async renderAck() {
    const daemon = fromUuidSync(this.#uuid);
    if (!daemon) return null;
    const [archetype, subtype] = await Promise.all([
      this.archetype.renderTable(daemon),
      this.subtype.renderTable(daemon),
    ]);
    return { uuid: this.#uuid, name: daemon.name, img: daemon.img, archetype, subtype };
  }
}
