import { prepareActiveEffectCategories } from '../helpers/effects.mjs';

const { api, sheets } = foundry.applications;
const DragDrop = foundry.applications.ux.DragDrop;

/**
 * Extend the basic ItemSheet with some very simple modifications
 * @extends {ItemSheetV2}
 */
export class DASUItemSheet extends api.HandlebarsApplicationMixin(
  sheets.ItemSheetV2
) {
  constructor(options = {}) {
    super(options);
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ['dasu', 'item'],
    position: {
      width: 500,
    },
    actions: {
      onEditImage: this._onEditImage,
      viewDoc: this._viewEffect,
      createDoc: this._createEffect,
      deleteDoc: this._deleteEffect,
      toggleEffect: this._toggleEffect,
    },
    form: {
      submitOnChange: false,
    },
    // Custom property that's merged into `this.options`
    dragDrop: [{ dragSelector: '.draggable', dropSelector: null }],
  };

  /** @override */
  static PARTS = {
    header: {
      template: 'systems/dasu/templates/item/header.hbs',
    },
    tabs: {
      // Foundry-provided generic template
      template: 'templates/generic/tab-navigation.hbs',
    },
    description: {
      template: 'systems/dasu/templates/item/description.hbs',
      scrollable: [''],
    },
    attributesAbility: {
      template: 'systems/dasu/templates/item/attribute-parts/ability.hbs',
      scrollable: [''],
    },
    attributesWeapon: {
      template: 'systems/dasu/templates/item/attribute-parts/weapon.hbs',
      scrollable: [''],
    },
    attributesTag: {
      template: 'systems/dasu/templates/item/attribute-parts/tag.hbs',
      scrollable: [''],
    },
    attributesTactic: {
      template: 'systems/dasu/templates/item/attribute-parts/tactic.hbs',
      scrollable: [''],
    },
    attributesSpecial: {
      template: 'systems/dasu/templates/item/attribute-parts/special.hbs',
      scrollable: [''],
    },
    attributesScar: {
      template: 'systems/dasu/templates/item/attribute-parts/scar.hbs',
      scrollable: [''],
    },
    effects: {
      template: 'systems/dasu/templates/item/effects.hbs',
      scrollable: [''],
    },
  };

  /* -------------------------------------------- */

  /** @override */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    // Not all parts always render
    options.parts = ['header', 'tabs'];
    // Don't show the other tabs if only limited view
    if (this.document.limited) return;
    // Control which parts show based on document subtype
    switch (this.document.type) {
      case 'ability':
        console.log('DASU: Rendering ability');
        // Always use attributesAbility for all ability items
        // Category-specific rendering is handled within the ability template
        options.parts.push('attributesAbility', 'effects');
        break;
      case 'weapon':
        console.log('DASU: Rendering weapon');
        options.parts.push('attributesWeapon', 'effects');
        break;
      case 'tag':
        console.log('DASU: Rendering tag');
        options.parts.push('attributesTag', 'description', 'effects');
        break;
      case 'tactic':
        console.log('DASU: Rendering tactic');
        options.parts.push('attributesTactic', 'effects');
        break;
      case 'special':
        console.log('DASU: Rendering special');
        options.parts.push('attributesSpecial', 'description', 'effects');
        break;
      case 'scar':
        console.log('DASU: Rendering scar');
        options.parts.push('attributesScar', 'description', 'effects');
        break;
    }
    console.log('DASU: Final parts array:', options.parts);
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    console.log(
      'DASU: Preparing main context for item type:',
      this.document.type
    );
    const context = {
      // Validates both permissions and compendium status
      editable: this.isEditable,
      owner: this.document.isOwner,
      limited: this.document.limited,
      // Add the item document.
      item: this.item,
      // Adding system and flags for easier access
      system: this.item.system,
      flags: this.item.flags,
      // Adding a pointer to CONFIG.DASU
      config: globalThis.DASU,
      // You can factor out context construction to helper functions
      tabs: this._getTabs(options.parts),
    };

    // Add shared context for header
    if (this.document.type === 'ability') {
      console.log('DASU: Adding ability-specific context');
      // Use ABILITY_CATEGORIES from config instead of hardcoded options
      context.itemCategories = {};
      const abilityCategories = globalThis.DASU?.ABILITY_CATEGORIES || [
        'spell',
        'technique',
        'affliction',
        'restorative',
      ];
      abilityCategories.forEach((category) => {
        context.itemCategories[category] = game.i18n.localize(
          `TYPES.Item.${category}`
        );
      });
    }

    if (this.document.type === 'weapon') {
      console.log('DASU: Adding weapon-specific context');
      context.rangeTypes = {
        melee: 'Melee',
        ranged: 'Ranged',
        thrown: 'Thrown',
      };
    }

    console.log('DASU: Main context prepared, parts:', options.parts);
    return context;
  }

  /** @override */
  async _preparePartContext(partId, context) {
    console.log('DASU: Preparing part context for:', partId);
    switch (partId) {
      case 'attributesAbility':
        console.log(
          'DASU: Preparing ability context for category:',
          this.item.system.category
        );
        // This is the unified ability partial that renders different content based on category
        context.tab = context.tabs[partId];
        // Add damage types for the select dropdowns (if needed by the category)
        context.damageTypes = {
          physical: game.i18n.localize('DASU.damageTypes.physical'),
          fire: game.i18n.localize('DASU.damageTypes.fire'),
          ice: game.i18n.localize('DASU.damageTypes.ice'),
          electric: game.i18n.localize('DASU.damageTypes.electric'),
          wind: game.i18n.localize('DASU.damageTypes.wind'),
          earth: game.i18n.localize('DASU.damageTypes.earth'),
          light: game.i18n.localize('DASU.damageTypes.light'),
          dark: game.i18n.localize('DASU.damageTypes.dark'),
          untyped: game.i18n.localize('DASU.damageTypes.untyped'),
        };
        // Add aptitude types for all ability categories
        context.aptitudeTypes = {};
        const aptitudeKeys = [
          'f',
          'i',
          'el',
          'w',
          'ea',
          'l',
          'd',
          'dp',
          'dm',
          'da',
          'h',
          'tb',
          'tt',
          'tg',
          'ta',
          'assist',
        ];
        aptitudeKeys.forEach((key) => {
          const long = game.i18n.localize(`DASU.aptitudeTypes.${key}.long`);
          const short = game.i18n.localize(`DASU.aptitudeTypes.${key}.short`);
          context.aptitudeTypes[key] = `${long} (${short})`;
        });
        // Add item categories for the category dropdown using ABILITY_CATEGORIES
        context.itemCategories = {};
        const abilityCategories = globalThis.DASU?.ABILITY_CATEGORIES || [
          'spell',
          'technique',
          'affliction',
          'restorative',
        ];
        abilityCategories.forEach((category) => {
          context.itemCategories[category] = game.i18n.localize(
            `TYPES.Item.${category}`
          );
        });
        // Add enriched description for ProseMirror
        context.enrichedDescription =
          await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            this.item.system.description,
            {
              secrets: this.document.isOwner,
              rollData: this.item.getRollData(),
              relativeTo: this.item,
            }
          );
        break;
      case 'attributesTag':
      case 'attributesScar':
        console.log('DASU: Preparing simple context for:', partId);
        // Necessary for preserving active tab on re-render
        context.tab = context.tabs[partId];
        break;
      case 'attributesWeapon':
        console.log('DASU: Preparing weapon context');
        // Necessary for preserving active tab on re-render
        context.tab = context.tabs[partId];
        // Add damage types for the select dropdowns
        context.damageTypes = {
          physical: game.i18n.localize('DASU.damageTypes.physical'),
          fire: game.i18n.localize('DASU.damageTypes.fire'),
          ice: game.i18n.localize('DASU.damageTypes.ice'),
          electric: game.i18n.localize('DASU.damageTypes.electric'),
          wind: game.i18n.localize('DASU.damageTypes.wind'),
          earth: game.i18n.localize('DASU.damageTypes.earth'),
          light: game.i18n.localize('DASU.damageTypes.light'),
          dark: game.i18n.localize('DASU.damageTypes.dark'),
          untyped: game.i18n.localize('DASU.damageTypes.untyped'),
        };
        // Add enriched description for ProseMirror
        context.enrichedDescription =
          await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            this.item.system.description,
            {
              secrets: this.document.isOwner,
              rollData: this.item.getRollData(),
              relativeTo: this.item,
            }
          );
        break;
      case 'attributesTactic':
        console.log('DASU: Preparing tactic context');
        // Necessary for preserving active tab on re-render
        context.tab = context.tabs[partId];
        // Add enriched description for ProseMirror
        context.enrichedDescription =
          await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            this.item.system.description,
            {
              secrets: this.document.isOwner,
              rollData: this.item.getRollData(),
              relativeTo: this.item,
            }
          );
        break;
      case 'description':
        console.log('DASU: Preparing description context');
        context.tab = context.tabs[partId];
        // Enrich description info for display
        // Enrichment turns text like `[[/r 1d20]]` into buttons
        context.enrichedDescription =
          await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            this.item.system.description,
            {
              // Whether to show secret blocks in the finished html
              secrets: this.document.isOwner,
              // Data to fill in for inline rolls
              rollData: this.item.getRollData(),
              // Relative UUID resolution
              relativeTo: this.item,
            }
          );
        break;
      case 'effects':
        console.log('DASU: Preparing effects context');
        context.tab = context.tabs[partId];
        // Prepare active effects for easier access
        context.effects = prepareActiveEffectCategories(this.item.effects);
        break;
      default:
        console.log('DASU: No specific context preparation for:', partId);
    }
    return context;
  }

  /**
   * Generates the data for the generic tab navigation template
   * @param {string[]} parts An array of named template parts to render
   * @returns {Record<string, Partial<ApplicationTab>>}
   * @protected
   */
  _getTabs(parts) {
    // If you have sub-tabs this is necessary to change
    const tabGroup = 'primary';
    // Default tab for first time it's rendered this session
    if (!this.tabGroups[tabGroup]) this.tabGroups[tabGroup] = 'attributes';
    return parts.reduce((tabs, partId) => {
      const tab = {
        cssClass: '',
        group: tabGroup,
        // Matches tab property to
        id: '',
        // FontAwesome Icon, if you so choose
        icon: '',
        // Run through localization
        label: 'DASU.Item.Tabs.',
      };
      switch (partId) {
        case 'header':
        case 'tabs':
          return tabs;
        case 'description':
          tab.id = 'description';
          tab.label += 'Description';
          break;
        case 'attributesAbility':
        case 'attributesWeapon':
        case 'attributesTag':
        case 'attributesTactic':
        case 'attributesSpecial':
        case 'attributesScar':
          tab.id = 'attributes';
          tab.label += 'Attributes';
          break;
        case 'effects':
          tab.id = 'effects';
          tab.label += 'Effects';
          break;
      }
      if (this.tabGroups[tabGroup] === tab.id) tab.cssClass = 'active';
      tabs[partId] = tab;
      return tabs;
    }, {});
  }

  /**
   * Actions performed after any render of the Application.
   * Post-render steps are not awaited by the render process.
   * @param {ApplicationRenderContext} context      Prepared context data
   * @param {RenderOptions} options                 Provided render options
   * @protected
   */
  async _onRender(context, options) {
    await super._onRender(context, options);

    // Add manual input change handlers to prevent array issues
    this.element
      .querySelectorAll('input[data-dtype="Number"]')
      .forEach((input) => {
        input.addEventListener('change', async (event) => {
          const name = event.target.name;
          const value = event.target.value;

          // Only update if the value is not empty
          if (value !== '' && value !== null && value !== undefined) {
            await this.document.update({ [name]: parseInt(value) || 0 });
          }
        });
      });

    // Add manual text input change handlers
    this.element
      .querySelectorAll('input[data-dtype="String"], input[type="text"]')
      .forEach((input) => {
        input.addEventListener('change', async (event) => {
          const name = event.target.name;
          const value = event.target.value;

          if (value !== null && value !== undefined) {
            await this.document.update({ [name]: value });
          }
        });
      });

    // Add manual select change handlers
    this.element.querySelectorAll('select').forEach((select) => {
      select.addEventListener('change', async (event) => {
        const name = event.target.name;
        const value = event.target.value;

        if (value !== '' && value !== null && value !== undefined) {
          await this.document.update({ [name]: value });
        }
      });
    });

    // Add manual textarea change handlers
    this.element.querySelectorAll('textarea').forEach((textarea) => {
      textarea.addEventListener('change', async (event) => {
        const name = event.target.name;
        const value = event.target.value;

        if (value !== null && value !== undefined) {
          await this.document.update({ [name]: value });
        }
      });
    });

    new DragDrop.implementation({
      dragSelector: '.draggable',
      dropSelector: null,
      permissions: {
        dragstart: this._canDragStart.bind(this),
        drop: this._canDragDrop.bind(this),
      },
      callbacks: {
        dragstart: this._onDragStart.bind(this),
        dragover: this._onDragOver.bind(this),
        drop: this._onDrop.bind(this),
      },
    }).bind(this.element);
    // You may want to add other special handling here
    // Foundry comes with a large number of utility classes, e.g. SearchFilter
    // That you may want to implement yourself.

    // Add change handler for category field on ability items (in header)
    if (this.document.type === 'ability') {
      const categorySelect = this.element.querySelector(
        'select[name="system.category"]'
      );
      if (categorySelect) {
        categorySelect.addEventListener(
          'change',
          this._onCategoryChange.bind(this)
        );
      }

      // Add change handler for isInfinity checkbox
      const infinityCheckbox = this.element.querySelector(
        'input[name="system.isInfinity"]'
      );
      if (infinityCheckbox) {
        infinityCheckbox.addEventListener(
          'change',
          this._onInfinityChange.bind(this)
        );
      }
    }
  }

  /**
   * Handle category change for ability items
   * @param {Event} event The change event
   * @private
   */
  async _onCategoryChange(event) {
    const newCategory = event.target.value;
    const oldCategory = this.document.system.category;

    if (oldCategory === newCategory) return;

    console.log(
      `DASU: Category changing from ${oldCategory} to ${newCategory}`
    );

    // Update the category - this will trigger the _preUpdate method in the item document
    // which will handle cleaning up incompatible fields
    await this.document.update({ 'system.category': newCategory });

    // Re-render the sheet to show the appropriate partial with cleaned data
    this.render(true);
  }

  /**
   * Handle infinity checkbox change for affliction abilities
   * @param {Event} event The change event
   * @private
   */
  async _onInfinityChange(event) {
    const isInfinity = event.target.checked;

    if (isInfinity) {
      // Clear the toHit value when infinity is checked
      await this.document.update({
        'system.isInfinity': true,
        'system.toHit': null,
      });
    } else {
      // Just update the infinity state when unchecked
      await this.document.update({
        'system.isInfinity': false,
      });
    }

    // Re-render to show the updated UI
    this.render(true);
  }

  /** @override */
  async _onSubmit(event, formData) {
    // Process the form data to ensure proper data types and prevent array issues
    const processedData = {};

    for (const [key, value] of formData.entries()) {
      // Skip empty values to prevent array issues
      if (value === '' || value === null || value === undefined) continue;

      // Handle nested properties like system.damage.value
      foundry.utils.setProperty(processedData, key, value);
    }

    // Update the document with the processed data
    await this.document.update(processedData);
  }

  /**************
   *
   *   ACTIONS
   *
   **************/

  /**
   * Handle changing a Document's image.
   *
   * @this DASUItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @returns {Promise}
   * @protected
   */
  static async _onEditImage(event, target) {
    const attr = target.dataset.edit;
    const current = foundry.utils.getProperty(this.document, attr);
    const { img } =
      this.document.constructor.getDefaultArtwork?.(this.document.toObject()) ??
      {};
    const fp = new FilePicker({
      current,
      type: 'image',
      redirectToRoot: img ? [img] : [],
      callback: (path) => {
        this.document.update({ [attr]: path });
      },
      top: this.position.top + 40,
      left: this.position.left + 10,
    });
    return fp.browse();
  }

  /**
   * Renders an embedded document's sheet
   *
   * @this DASUItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _viewEffect(event, target) {
    const effect = this._getEffect(target);
    effect.sheet.render(true);
  }

  /**
   * Handles item deletion
   *
   * @this DASUItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _deleteEffect(event, target) {
    const effect = this._getEffect(target);
    await effect.delete();
  }

  /**
   * Handle creating a new Owned Item or ActiveEffect for the actor using initial data defined in the HTML dataset
   *
   * @this DASUItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _createEffect(event, target) {
    // Retrieve the configured document class for ActiveEffect
    const aeCls = getDocumentClass('ActiveEffect');
    // Prepare the document creation data by initializing it a default name.
    // As of v12, you can define custom Active Effect subtypes just like Item subtypes if you want
    const effectData = {
      name: aeCls.defaultName({
        // defaultName handles an undefined type gracefully
        type: target.dataset.type,
        parent: this.item,
      }),
    };
    // Loop through the dataset and add it to our effectData
    for (const [dataKey, value] of Object.entries(target.dataset)) {
      // These data attributes are reserved for the action handling
      if (['action', 'documentClass'].includes(dataKey)) continue;
      // Nested properties require dot notation in the HTML, e.g. anything with `system`
      // An example exists in spells.hbs, with `data-system.spell-level`
      // which turns into the dataKey 'system.spellLevel'
      foundry.utils.setProperty(effectData, dataKey, value);
    }

    // Finally, create the embedded document!
    await aeCls.create(effectData, { parent: this.item });
  }

  /**
   * Determines effect parent to pass to helper
   *
   * @this DASUItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _toggleEffect(event, target) {
    const effect = this._getEffect(target);
    await effect.update({ disabled: !effect.disabled });
  }

  /** Helper Functions */

  /**
   * Fetches the row with the data for the rendered embedded document
   *
   * @param {HTMLElement} target  The element with the action
   * @returns {HTMLLIElement} The document's row
   */
  _getEffect(target) {
    const li = target.closest('.effect');
    return this.item.effects.get(li?.dataset?.effectId);
  }

  /**
   *
   * DragDrop
   *
   */

  /**
   * Define whether a user is able to begin a dragstart workflow for a given drag selector
   * @param {string} selector       The candidate HTML selector for dragging
   * @returns {boolean}             Can the current user drag this selector?
   * @protected
   */
  _canDragStart(selector) {
    // game.user fetches the current user
    return this.isEditable;
  }

  /**
   * Define whether a user is able to conclude a drag-and-drop workflow for a given drop selector
   * @param {string} selector       The candidate HTML selector for the drop target
   * @returns {boolean}             Can the current user drop on this selector?
   * @protected
   */
  _canDragDrop(selector) {
    // game.user fetches the current user
    return this.isEditable;
  }

  /**
   * Callback actions which occur at the beginning of a drag start workflow.
   * @param {DragEvent} event       The originating DragEvent
   * @protected
   */
  _onDragStart(event) {
    const li = event.currentTarget;
    if ('link' in event.target.dataset) return;

    let dragData = null;

    // Active Effect
    if (li.dataset.effectId) {
      const effect = this.item.effects.get(li.dataset.effectId);
      dragData = effect.toDragData();
    }

    if (!dragData) return;

    // Set data transfer
    event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
  }

  /**
   * Callback actions which occur when a dragged element is over a drop target.
   * @param {DragEvent} event       The originating DragEvent
   * @protected
   */
  _onDragOver(event) {}

  /**
   * Callback actions which occur when a dragged element is dropped on a target.
   * @param {DragEvent} event       The originating DragEvent
   * @protected
   */
  async _onDrop(event) {
    const data = TextEditor.getDragEventData(event);
    const item = this.item;
    const allowed = Hooks.call('dropItemSheetData', item, this, data);
    if (allowed === false) return;

    // Although you will find implmentations to all doc types here, it is important to keep
    // in mind that only Active Effects are "valid" for items.
    // Actors have items, but items do not have actors.
    // Items in items is not implemented on Foudry per default. If you need an implementation with that,
    // try to search how other systems do. Basically they will use the drag and drop, but they will store
    // the UUID of the item.
    // Folders can only contain Actors or Items. So, fall on the cases above.
    // We left them here so you can have an idea of how that would work, if you want to do some kind of
    // implementation for that.
    switch (data.type) {
      case 'ActiveEffect':
        return this._onDropActiveEffect(event, data);
      case 'Actor':
        return this._onDropActor(event, data);
      case 'Item':
        return this._onDropItem(event, data);
      case 'Folder':
        return this._onDropFolder(event, data);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle the dropping of ActiveEffect data onto an Actor Sheet
   * @param {DragEvent} event                  The concluding DragEvent which contains drop data
   * @param {object} data                      The data transfer extracted from the event
   * @returns {Promise<ActiveEffect|boolean>}  The created ActiveEffect object or false if it couldn't be created.
   * @protected
   */
  async _onDropActiveEffect(event, data) {
    const aeCls = getDocumentClass('ActiveEffect');
    const effect = await aeCls.fromDropData(data);
    if (!this.item.isOwner || !effect) return false;

    if (this.item.uuid === effect.parent?.uuid)
      return this._onEffectSort(event, effect);
    return aeCls.create(effect, { parent: this.item });
  }

  /**
   * Sorts an Active Effect based on its surrounding attributes
   *
   * @param {DragEvent} event
   * @param {ActiveEffect} effect
   */
  _onEffectSort(event, effect) {
    const effects = this.item.effects;
    const dropTarget = event.target.closest('[data-effect-id]');
    if (!dropTarget) return;
    const target = effects.get(dropTarget.dataset.effectId);

    // Don't sort on yourself
    if (effect.id === target.id) return;

    // Identify sibling items based on adjacent HTML elements
    const siblings = [];
    for (let el of dropTarget.parentElement.children) {
      const siblingId = el.dataset.effectId;
      if (siblingId && siblingId !== effect.id)
        siblings.push(effects.get(el.dataset.effectId));
    }

    // Perform the sort
    const sortUpdates = SortingHelpers.performIntegerSort(effect, {
      target,
      siblings,
    });
    const updateData = sortUpdates.map((u) => {
      const update = u.update;
      update._id = u.target._id;
      return update;
    });

    // Perform the update
    return this.item.updateEmbeddedDocuments('ActiveEffect', updateData);
  }

  /* -------------------------------------------- */

  /**
   * Handle dropping of an Actor data onto another Actor sheet
   * @param {DragEvent} event            The concluding DragEvent which contains drop data
   * @param {object} data                The data transfer extracted from the event
   * @returns {Promise<object|boolean>}  A data object which describes the result of the drop, or false if the drop was
   *                                     not permitted.
   * @protected
   */
  async _onDropActor(event, data) {
    if (!this.item.isOwner) return false;
  }

  /* -------------------------------------------- */

  /**
   * Handle dropping of an item reference or item data onto an Actor Sheet
   * @param {DragEvent} event            The concluding DragEvent which contains drop data
   * @param {object} data                The data transfer extracted from the event
   * @returns {Promise<Item[]|boolean>}  The created or updated Item instances, or false if the drop was not permitted.
   * @protected
   */
  async _onDropItem(event, data) {
    if (!this.item.isOwner) return false;
  }

  /* -------------------------------------------- */

  /**
   * Handle dropping of a Folder on an Actor Sheet.
   * The core sheet currently supports dropping a Folder of Items to create all items as owned items.
   * @param {DragEvent} event     The concluding DragEvent which contains drop data
   * @param {object} data         The data transfer extracted from the event
   * @returns {Promise<Item[]>}
   * @protected
   */
  async _onDropFolder(event, data) {
    if (!this.item.isOwner) return [];
  }
}
