import { DASUActorSheet } from './actor-sheet.mjs';

export class DASUDaemonActorSheet extends DASUActorSheet {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ['dasu', 'sheet', 'actor', 'daemon'],
    position: { width: 600, height: 650 },
  };

  /** @override */
  static TABS = {
    primary: {
      tabs: [
        { id: 'description', label: 'Identity', icon: 'fas fa-feather' },
        { id: 'items', label: 'Items', icon: 'fas fa-backpack' },
        { id: 'effects', label: 'Effects', icon: 'fas fa-bolt' },
      ],
      initial: 'description',
    },
  };

  /** @override */
  static PARTS = {
    header: {
      template: 'systems/dasu/templates/actor/parts/header-daemon.hbs',
    },
    sidebar: {
      template: 'systems/dasu/templates/actor/parts/sidebar-daemon.hbs',
    },
    tabs: { template: 'systems/dasu/templates/actor/parts/tab-navigation.hbs' },
    description: {
      template: 'systems/dasu/templates/actor/parts/description.hbs',
      scrollable: [''],
    },
    items: {
      template: 'systems/dasu/templates/actor/parts/items.hbs',
      scrollable: [''],
    },
    effects: {
      template: 'systems/dasu/templates/actor/parts/effects.hbs',
      scrollable: [''],
    },
  };

  /** @override */
  _onFirstRender(context, options) {
    this.tabGroups.primary ??= 'description';
    super._onFirstRender(context, options);
  }
}
