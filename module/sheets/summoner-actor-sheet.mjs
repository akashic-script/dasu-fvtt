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
        {
          id: 'identity',
          label: 'DASU.Sheet.Tab.Identity',
          icon: 'fas fa-circle-nodes',
        },
        {
          id: 'syn',
          label: 'DASU.Sheet.Tab.Syn',
          icon: 'fas fa-share-nodes',
        },
        {
          id: 'features',
          label: 'DASU.Sheet.Tab.Features',
          icon: 'fas fa-star-and-crescent',
        },
        {
          id: 'abilities',
          label: 'DASU.Sheet.Tab.Abilities',
          icon: 'fas fa-hand-fist',
        },
        { id: 'items', label: 'DASU.Sheet.Tab.Items', icon: 'fa-solid fa-suitcase' },
        { id: 'effects', label: 'DASU.Sheet.Tab.Effects', icon: 'fas fa-bolt' },
      ],
      initial: 'identity',
    },
  };

  /** @override */
  static PARTS = {
    header: { template: 'systems/dasu/templates/actor/parts/header.hbs' },
    sidebar: { template: 'systems/dasu/templates/actor/parts/sidebar.hbs' },
    tabs: { template: 'systems/dasu/templates/actor/parts/tab-navigation.hbs' },
    syn: {
      template: 'systems/dasu/templates/actor/parts/syn.hbs',
      scrollable: [''],
    },
    abilities: {
      template: 'systems/dasu/templates/actor/parts/abilities.hbs',
      scrollable: [''],
    },
    features: {
      template: 'systems/dasu/templates/actor/parts/features.hbs',
      scrollable: [''],
    },
    identity: {
      template: 'systems/dasu/templates/actor/parts/identity.hbs',
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
}
