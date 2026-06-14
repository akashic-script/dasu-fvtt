import { DASUActorSheet } from './actor-sheet.mjs';

export class DASUSummonerActorSheet extends DASUActorSheet {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ['dasu', 'sheet', 'actor', 'summoner'],
  };

  /** @override */
  static TABS = {
    primary: {
      tabs: [
        { id: 'features', label: 'Features', icon: 'fas fa-list' },
        { id: 'description', label: 'Identity', icon: 'fas fa-feather' },
        { id: 'items', label: 'Items', icon: 'fas fa-backpack' },
        { id: 'spells', label: 'Spells', icon: 'fas fa-book-sparkles' },
        { id: 'effects', label: 'Effects', icon: 'fas fa-bolt' },
      ],
      initial: 'features',
    },
  };

  /** @override */
  static PARTS = {
    header: { template: 'systems/dasu/templates/actor/parts/header.hbs' },
    sidebar: { template: 'systems/dasu/templates/actor/parts/sidebar.hbs' },
    tabs: { template: 'systems/dasu/templates/actor/parts/tab-navigation.hbs' },
    features: {
      template: 'systems/dasu/templates/actor/parts/features.hbs',
      scrollable: [''],
    },
    description: {
      template: 'systems/dasu/templates/actor/parts/description.hbs',
      scrollable: [''],
    },
    items: {
      template: 'systems/dasu/templates/actor/parts/items.hbs',
      scrollable: [''],
    },
    spells: {
      template: 'systems/dasu/templates/actor/parts/spells.hbs',
      scrollable: [''],
    },
    effects: {
      template: 'systems/dasu/templates/actor/parts/effects.hbs',
      scrollable: [''],
    },
  };
}
