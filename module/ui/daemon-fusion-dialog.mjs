/**
 * @fileoverview Daemon Fusion Dialog
 * A dialog that allows drag-and-drop of daemon actors for fusion
 */

import { SystemControls } from '../helpers/system-controls.mjs';

/**
 * Daemon Fusion Dialog Application
 * Allows users to drag and drop daemon actors for fusion
 */
export class DaemonFusionDialog extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'daemon-fusion-dialog',
    classes: ['dasu', 'daemon-fusion'],
    window: {
      title: 'DASU.DaemonFusion.Title',
      icon: 'fa-solid fa-layer-group',
      resizable: true,
    },
    position: {
      width: 500,
      height: 'auto',
    },
    actions: {
      removeDaemon: DaemonFusionDialog._onRemoveDaemon,
      clearAll: DaemonFusionDialog._onClearAll,
      performFusion: DaemonFusionDialog._onPerformFusion,
      switchTab: DaemonFusionDialog._onSwitchTab,
    },
  };

  /**
   * The daemons currently in the fusion pool
   * @type {Actor[]}
   */
  daemons = [];

  /**
   * Current active tab
   * @type {string}
   */
  activeTab = 'preview';

  /**
   * Fusion customization settings
   * @type {Object}
   */
  settings = {
    levelFormula: 'average',
    namePattern: 'fusedFirst',
    imageSource: 'first',
    attributeFormula: 'first',
    itemInheritance: 'merge',
    resistanceSource: null,
  };

  constructor(options = {}) {
    super(options);
  }

  /** @override */
  static PARTS = {
    content: {
      template: 'systems/dasu/templates/ui/daemon-fusion-dialog.hbs',
    },
  };

  /** @override */
  async _prepareContext(_options) {
    const context = await super._prepareContext(_options);

    context.daemons = this.daemons.map((daemon) => ({
      id: daemon.id,
      uuid: daemon.uuid,
      name: daemon.name,
      img: daemon.img,
      level: daemon.system.level,
    }));

    context.canFuse = this.daemons.length >= 2;
    context.isEmpty = this.daemons.length === 0;
    context.activeTabIsPreview = this.activeTab === 'preview';

    // Set default resistance source to first daemon if not set or invalid
    if (
      !this.settings.resistanceSource ||
      !this.daemons.find((d) => d.id === this.settings.resistanceSource)
    ) {
      this.settings.resistanceSource = this.daemons[0]?.id || null;
    }

    context.settings = this.settings;

    // Generate result preview if we can fuse
    if (context.canFuse) {
      const previewData = this._calculateFusionResult();
      context.resultPreview = {
        name: previewData.name,
        img: previewData.img,
        level: previewData.level,
      };
    }

    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // Attach drag and drop listeners to content area only (not nested zones)
    const dropZone = this.element.querySelector('.daemon-fusion-content');
    if (dropZone) {
      dropZone.addEventListener('dragover', this._onDragOver.bind(this));
      dropZone.addEventListener('drop', this._onDrop.bind(this));
      dropZone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#4287f5';
      });
      dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '';
      });
    }

    // Attach click listeners to daemon cards to open sheets
    const daemonCards = this.element.querySelectorAll('.daemon-card');
    daemonCards.forEach((card) => {
      const daemonId = card.dataset.daemonId;
      const daemon = this.daemons.find((d) => d.id === daemonId);

      if (daemon) {
        const clickableElements = [
          card.querySelector('.daemon-portrait'),
          card.querySelector('.daemon-name'),
        ].filter(Boolean);

        clickableElements.forEach((el) => {
          el.style.cursor = 'pointer';
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (daemon.testUserPermission(game.user, 'OBSERVER')) {
              daemon.sheet.render(true);
            } else {
              ui.notifications.warn(
                game.i18n.localize('DASU.NoPermissionToView')
              );
            }
          });
        });
      }
    });

    // Attach listeners to customization controls
    const settingControls = this.element.querySelectorAll('[data-setting]');
    settingControls.forEach((control) => {
      control.addEventListener('change', (e) => {
        const setting = e.target.dataset.setting;
        this.settings[setting] = e.target.value;
        this.render();
      });
    });

    // Update button states
    this._updateButtonStates();
  }

  /**
   * Update button states based on current daemon count
   * @private
   */
  _updateButtonStates() {
    const clearButton = this.element.querySelector('[data-action="clearAll"]');
    const fuseButton = this.element.querySelector(
      '[data-action="performFusion"]'
    );

    if (clearButton) {
      clearButton.disabled = this.daemons.length === 0;
    }

    if (fuseButton) {
      fuseButton.disabled = this.daemons.length < 2;
    }
  }

  /**
   * Handle dragover event
   * @param {DragEvent} event
   * @private
   */
  _onDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  /**
   * Handle drop event
   * @param {DragEvent} event
   * @private
   */
  async _onDrop(event) {
    event.preventDefault();
    event.stopPropagation();

    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData('text/plain'));
    } catch (err) {
      return;
    }

    // Only accept Actor drops
    if (data.type !== 'Actor') {
      ui.notifications.warn(
        game.i18n.localize('DASU.DaemonFusion.OnlyDaemons')
      );
      return;
    }

    // Get the actor
    const actor = await fromUuid(data.uuid);
    if (!actor) {
      ui.notifications.error(
        game.i18n.localize('DASU.DaemonFusion.ActorNotFound')
      );
      return;
    }

    // Check if it's a daemon
    if (actor.type !== 'daemon') {
      ui.notifications.warn(
        game.i18n.localize('DASU.DaemonFusion.OnlyDaemons')
      );
      return;
    }

    // Check if already added
    if (this.daemons.find((d) => d.id === actor.id)) {
      ui.notifications.warn(
        game.i18n.localize('DASU.DaemonFusion.AlreadyAdded')
      );
      return;
    }

    // Add to fusion pool
    this.daemons.push(actor);
    ui.notifications.info(
      game.i18n.format('DASU.DaemonFusion.DaemonAdded', { name: actor.name })
    );

    // Re-render to show the new daemon
    this.render();
  }

  /**
   * Calculate the fusion result based on current settings
   * @returns {Object} Fusion result data
   * @private
   */
  _calculateFusionResult() {
    if (this.daemons.length < 2) return null;

    // Calculate level
    let level;
    switch (this.settings.levelFormula) {
      case 'sum':
        level = this.daemons.reduce((sum, d) => sum + d.system.level, 0);
        break;
      case 'max':
        level = Math.max(...this.daemons.map((d) => d.system.level));
        break;
      case 'maxPlus':
        level = Math.max(...this.daemons.map((d) => d.system.level)) + 1;
        break;
      case 'average':
      default:
        level = Math.ceil(
          this.daemons.reduce((sum, d) => sum + d.system.level, 0) /
            this.daemons.length
        );
        break;
    }

    // Calculate name
    let name;
    switch (this.settings.namePattern) {
      case 'combined':
        name = this.daemons.map((d) => d.name).join('+');
        break;
      case 'first':
        name = this.daemons[0].name;
        break;
      case 'last':
        name = this.daemons[this.daemons.length - 1].name;
        break;
      case 'fusedFirst':
      default:
        name = game.i18n.format('DASU.DaemonFusion.FusedName', {
          name: this.daemons[0].name,
        });
        break;
    }

    // Select image
    let img;
    switch (this.settings.imageSource) {
      case 'last':
        img = this.daemons[this.daemons.length - 1].img;
        break;
      case 'highest':
        img = this.daemons.reduce((a, b) =>
          a.system.level > b.system.level ? a : b
        ).img;
        break;
      case 'random':
        img = this.daemons[Math.floor(Math.random() * this.daemons.length)].img;
        break;
      case 'first':
      default:
        img = this.daemons[0].img;
        break;
    }

    return { level, name, img };
  }

  /**
   * Handle switching tabs
   * @param {Event} event
   * @param {HTMLElement} target
   * @private
   */
  static _onSwitchTab(event, target) {
    this.activeTab = target.dataset.tab;
    this.render();
  }

  /**
   * Handle removing a daemon from the fusion pool
   * @param {Event} event
   * @param {HTMLElement} target
   * @private
   */
  static _onRemoveDaemon(event, target) {
    const daemonId = target.dataset.daemonId;
    const index = this.daemons.findIndex((d) => d.id === daemonId);

    if (index !== -1) {
      const removed = this.daemons.splice(index, 1)[0];
      ui.notifications.info(
        game.i18n.format('DASU.DaemonFusion.DaemonRemoved', {
          name: removed.name,
        })
      );
      this.render();
    }
  }

  /**
   * Handle clearing all daemons
   * @param {Event} event
   * @param {HTMLElement} target
   * @private
   */
  static _onClearAll(event, target) {
    this.daemons = [];
    ui.notifications.info(game.i18n.localize('DASU.DaemonFusion.Cleared'));
    this.render();
  }

  /**
   * Handle performing the fusion
   * @param {Event} event
   * @param {HTMLElement} target
   * @private
   */
  static async _onPerformFusion(event, target) {
    if (this.daemons.length < 2) {
      ui.notifications.warn(
        game.i18n.localize('DASU.DaemonFusion.NeedTwoDaemons')
      );
      return;
    }

    try {
      // Use first daemon as base template
      const baseDaemon = this.daemons[0];

      // Calculate fusion result based on settings
      const fusionResult = this._calculateFusionResult();

      // Select resistance source daemon by ID
      const resistanceSourceDaemon =
        this.daemons.find((d) => d.id === this.settings.resistanceSource) ||
        baseDaemon;

      // Prepare system data based on resistance source
      let systemData = foundry.utils.deepClone(resistanceSourceDaemon.system);
      systemData.level = fusionResult.level;

      // Handle attribute fusion
      if (this.settings.attributeFormula !== 'first') {
        const attributes = ['pow', 'dex', 'will', 'sta'];
        for (const attr of attributes) {
          let value;
          switch (this.settings.attributeFormula) {
            case 'average':
              value = Math.ceil(
                this.daemons.reduce(
                  (sum, d) => sum + d.system.attributes[attr].value,
                  0
                ) / this.daemons.length
              );
              break;
            case 'sum':
              value = this.daemons.reduce(
                (sum, d) => sum + d.system.attributes[attr].value,
                0
              );
              break;
            case 'max':
              value = Math.max(
                ...this.daemons.map((d) => d.system.attributes[attr].value)
              );
              break;
            default:
              value = baseDaemon.system.attributes[attr].value;
          }
          systemData.attributes[attr].value = value;
        }
      }

      // Create new daemon actor
      const fusedDaemon = await Actor.create({
        name: fusionResult.name,
        type: 'daemon',
        img: fusionResult.img,
        system: systemData,
        folder: baseDaemon.folder?.id,
      });

      // Handle item inheritance
      if (fusedDaemon && this.settings.itemInheritance !== 'first') {
        if (this.settings.itemInheritance === 'merge') {
          const allItems = [];
          for (const daemon of this.daemons) {
            const items = daemon.items.map((item) => item.toObject());
            allItems.push(...items);
          }

          // Remove duplicates by name
          const uniqueItems = [];
          const seenNames = new Set();
          for (const item of allItems) {
            if (!seenNames.has(item.name)) {
              seenNames.add(item.name);
              uniqueItems.push(item);
            }
          }

          await fusedDaemon.createEmbeddedDocuments('Item', uniqueItems);
        } else if (this.settings.itemInheritance === 'none') {
          // Delete all items
          const itemIds = fusedDaemon.items.map((i) => i.id);
          await fusedDaemon.deleteEmbeddedDocuments('Item', itemIds);
        }
      }

      if (fusedDaemon) {
        ui.notifications.info(
          game.i18n.format('DASU.DaemonFusion.FusionSuccess', {
            name: fusionResult.name,
            count: this.daemons.length,
          })
        );

        // Open the new daemon's sheet
        fusedDaemon.sheet.render(true);

        // Clear the fusion pool
        this.daemons = [];

        // Close dialog
        this.close();
      }
    } catch (error) {
      console.error('DASU Daemon Fusion | Error creating fused daemon:', error);
      ui.notifications.error(
        game.i18n.localize('DASU.DaemonFusion.FusionError')
      );
    }
  }
}

// Singleton instance
let fusionDialog;

/**
 * Open the daemon fusion dialog
 */
export function openDaemonFusion() {
  if (!fusionDialog) {
    fusionDialog = new DaemonFusionDialog();
  } else {
    // Clear the fusion pool when reopening the dialog
    fusionDialog.daemons = [];
    fusionDialog.activeTab = 'preview';
    fusionDialog.settings = {
      levelFormula: 'average',
      namePattern: 'fusedFirst',
      imageSource: 'first',
      attributeFormula: 'first',
      itemInheritance: 'merge',
      resistanceSource: null,
    };
  }

  fusionDialog.render(true);
}

/**
 * Register the daemon fusion button
 * @param {SystemControlTool[]} tools
 */
function onGetSystemTools(tools) {
  tools.push({
    name: 'DASU.DaemonFusion.ButtonTitle',
    icon: 'fa-solid fa-layer-group',
    onClick: () => openDaemonFusion(),
  });
}

// Register the button
Hooks.on(SystemControls.HOOK_GET_SYSTEM_TOOLS, onGetSystemTools);

// Also support chat command
Hooks.on('chatMessage', (chatLog, message) => {
  if (/^\/(fusion|fuse)$/i.test(message)) {
    openDaemonFusion();
    return false; // Prevent message from being sent
  }
});
