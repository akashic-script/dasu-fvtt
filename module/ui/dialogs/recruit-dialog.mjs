/**
 * DASU Recruit Dialog Application
 * Allows daemon actors to select which summoner to join
 */

export class DASURecruitDialog extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  constructor(daemon, options = {}) {
    super(options);
    this.daemon = daemon;
  }

  static DEFAULT_OPTIONS = {
    id: 'dasu-recruit-dialog',
    tag: 'div',
    window: {
      title: 'DASU.Actor.Recruit.Title',
      icon: 'fas fa-user-plus',
      resizable: false,
    },
    position: {
      width: 450,
      height: 'auto',
    },
    actions: {
      recruit: DASURecruitDialog._onRecruit,
      cancel: DASURecruitDialog._onCancel,
    },
  };

  static PARTS = {
    form: {
      template: 'systems/dasu/templates/applications/recruit-dialog.hbs',
    },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Get all summoner actors from the game that don't already have this daemon in their stock
    const summonerActors = game.actors.filter((actor) => {
      if (actor.type !== 'summoner') return false;

      // Check if this daemon is already in the summoner's stock
      const stocks = actor.system.stocks || [];
      const hasThisDaemon = stocks.some(
        (stock) => stock.actorId === this.daemon.id
      );

      return !hasThisDaemon;
    });

    context.summoners = summonerActors.map((actor) => ({
      id: actor.id,
      name: actor.name,
      img: actor.img,
      level: actor.system.level || 1,
    }));

    context.hasSummoners = summonerActors.length > 0;
    context.daemonName = this.daemon.name;
    context.daemon = {
      img: this.daemon.img,
      name: this.daemon.name,
    };

    return context;
  }

  /**
   * Handle recruit button click
   * @param {Event} event - Button click event
   * @param {HTMLElement} target - The clicked element
   */
  static async _onRecruit(event, target) {
    event.preventDefault();

    const form = target.closest('form') || this.element.querySelector('form');
    const formData = new FormData(form);
    const selectedSummonerId = formData.get('selectedActor');

    if (!selectedSummonerId) {
      ui.notifications.warn(
        game.i18n.localize('DASU.Actor.Recruit.NoSelection')
      );
      return;
    }

    const selectedSummoner = game.actors.get(selectedSummonerId);
    if (!selectedSummoner) {
      ui.notifications.error(
        game.i18n.localize('DASU.Actor.Recruit.ActorNotFound')
      );
      return;
    }

    if (selectedSummoner.type !== 'summoner') {
      ui.notifications.error(
        game.i18n.localize('DASU.Actor.Recruit.NotSummoner')
      );
      return;
    }

    try {
      // Find or create "Recruited" folder
      let recruitedFolder = game.folders.find(
        (f) => f.name === 'Recruited' && f.type === 'Actor'
      );
      if (!recruitedFolder) {
        recruitedFolder = await Folder.create({
          name: 'Recruited',
          type: 'Actor',
          parent: null,
        });
      }

      // Clone the daemon into the Recruited folder
      let clonedDaemon;
      if (this.daemon.pack) {
        // If from compendium, create a new actor in the world
        const daemonData = this.daemon.toObject();
        clonedDaemon = await Actor.create({
          ...daemonData,
          folder: recruitedFolder.id,
          'prototypeToken.disposition': 1,
          'prototypeToken.actorLink': true,
        });
      } else {
        // If from world, clone normally
        clonedDaemon = await this.daemon.clone(
          {
            name: this.daemon.name,
            folder: recruitedFolder.id,
            'prototypeToken.disposition': 1,
            'prototypeToken.actorLink': true,
          },
          { save: true }
        );
      }

      // Add the cloned daemon to the selected summoner's stock
      const currentStocks = selectedSummoner.system.stocks || [];
      const newStock = {
        actorId: clonedDaemon.id,
        isSummoned: false,
      };

      await selectedSummoner.update({
        'system.stocks': [...currentStocks, newStock],
      });

      ui.notifications.info(
        game.i18n.format('DASU.Actor.Recruit.Success', {
          daemonName: clonedDaemon.name,
          summonerName: selectedSummoner.name,
        })
      );

      this.close();
    } catch (error) {
      console.error('Recruit error:', error);
      ui.notifications.error(game.i18n.localize('DASU.Actor.Recruit.Error'));
    }
  }

  /**
   * Handle cancel button click
   * @param {Event} event - Button click event
   */
  static async _onCancel(event) {
    event.preventDefault();
    this.close();
  }
}
