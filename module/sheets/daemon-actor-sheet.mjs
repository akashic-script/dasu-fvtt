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
        {
          id: 'identity',
          label: 'DASU.Sheet.Tab.Identity',
          icon: 'fas fa-circle-nodes',
        },
        {
          id: 'ack',
          label: 'DASU.Sheet.Tab.Ack',
          icon: 'fas fa-arrows-rotate',
        },
        { id: 'features', label: 'DASU.Sheet.Tab.Features', icon: 'fas fa-star-and-crescent' },
        { id: 'items', label: 'DASU.Sheet.Tab.Items', icon: 'fas fa-suitcase' },
        { id: 'effects', label: 'DASU.Sheet.Tab.Effects', icon: 'fas fa-bolt' },
      ],
      initial: 'identity',
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
    identity: {
      template: 'systems/dasu/templates/actor/parts/identity.hbs',
      scrollable: [''],
    },
    ack: {
      template: 'systems/dasu/templates/actor/parts/ack.hbs',
      scrollable: [''],
    },
    features: {
      template: 'systems/dasu/templates/actor/parts/features.hbs',
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
    this.tabGroups.primary ??= 'identity';
    super._onFirstRender(context, options);
  }
}
