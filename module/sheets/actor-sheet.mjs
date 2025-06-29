import { prepareActiveEffectCategories } from '../helpers/effects.mjs';

const { api, sheets } = foundry.applications;

/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheetV2}
 */
export class DASUActorSheet extends api.HandlebarsApplicationMixin(
  sheets.ActorSheetV2
) {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ['dasu', 'actor'],
    position: {
      width: 700,
      height: 950,
    },
    actions: {
      onEditImage: this._onEditImage,
      viewDoc: this._viewDoc,
      createDoc: this._createDoc,
      deleteDoc: this._deleteDoc,
      toggleEffect: this._toggleEffect,
      toggleSummoned: this._toggleSummoned,
      removeFromStock: this._removeFromStock,
      roll: this._onRoll,
      levelUp: this._levelUp,
    },
    // Custom property that's merged into `this.options`
    // dragDrop: [{ dragSelector: '.draggable', dropSelector: null }],
    form: {
      submitOnChange: false,
    },
  };

  /** @override */
  static PARTS = {
    header: {
      template: 'systems/dasu/templates/actor/header.hbs',
    },
    tabs: {
      // Foundry-provided generic template
      template: 'templates/generic/tab-navigation.hbs',
    },
    main: {
      template: 'systems/dasu/templates/actor/main.hbs',
      scrollable: [''],
    },
    biography: {
      template: 'systems/dasu/templates/actor/biography.hbs',
      scrollable: [''],
    },
    stocks: {
      template: 'systems/dasu/templates/actor/stocks.hbs',
      scrollable: [''],
    },
    items: {
      template: 'systems/dasu/templates/actor/items.hbs',
      scrollable: [''],
    },
    effects: {
      template: 'systems/dasu/templates/actor/effects.hbs',
      scrollable: [''],
    },
  };

  /** @override */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    // Not all parts always render
    options.parts = ['header', 'tabs', 'biography'];
    // Don't show the other tabs if only limited view
    if (this.document.limited) return;
    // Control which parts show based on document subtype
    switch (this.document.type) {
      case 'summoner':
        options.parts.push('main', 'stocks', 'items', 'effects');
        break;
      case 'daemon':
        options.parts.push('main', 'items', 'effects');
        break;
    }
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    // Output initialization
    const context = {
      // Validates both permissions and compendium status
      editable: this.isEditable,
      owner: this.document.isOwner,
      limited: this.document.limited,
      // Add the actor document.
      actor: this.actor,
      // Add the actor's data to context.data for easier access, as well as flags.
      system: this.actor.system,
      flags: this.actor.flags,
      // Adding a pointer to CONFIG.DASU
      config: globalThis.DASU,
      tabs: this._getTabs(options.parts),
      // Necessary for formInput and formFields helpers
      fields: this.document.schema.fields,
      systemFields: this.document.system.schema.fields,
      // Edit mode state
      isEditMode: this._isEditMode(),
    };

    // Offloading context prep to a helper function
    await this._prepareItems(context);

    return context;
  }

  /** @override */
  async _preparePartContext(partId, context) {
    switch (partId) {
      case 'main':
      case 'stocks':
      case 'items':
        context.tab = context.tabs[partId];
        break;
      case 'biography':
        context.tab = context.tabs[partId];
        // Enrich biography info for display
        // Enrichment turns text like `[[/r 1d20]]` into buttons
        context.enrichedBiography =
          await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            this.actor.system.biography,
            {
              // Whether to show secret blocks in the finished html
              secrets: this.document.isOwner,
              // Data to fill in for inline rolls
              rollData: this.actor.getRollData(),
              // Relative UUID resolution
              relativeTo: this.actor,
            }
          );
        break;
      case 'effects':
        context.tab = context.tabs[partId];
        // Prepare active effects
        context.effects = prepareActiveEffectCategories(
          // A generator that returns all effects stored on the actor
          // as well as any items
          this.actor.allApplicableEffects()
        );
        break;
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
    if (!this.tabGroups[tabGroup]) this.tabGroups[tabGroup] = 'biography';
    return parts.reduce((tabs, partId) => {
      const tab = {
        cssClass: '',
        group: tabGroup,
        // Matches tab property to
        id: '',
        // FontAwesome Icon, if you so choose
        icon: '',
        // Run through localization
        label: 'DASU.Actor.Tabs.',
      };
      switch (partId) {
        case 'header':
        case 'tabs':
          return tabs;
        case 'main':
          tab.id = 'main';
          tab.label += 'Main';
          break;
        case 'stocks':
          tab.id = 'stocks';
          tab.label += 'Stocks';
          break;
        case 'biography':
          tab.id = 'biography';
          tab.label += 'Biography';
          break;
        case 'items':
          tab.id = 'items';
          tab.label += 'Items';
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
   * Get the header buttons for the actor sheet
   * @returns {ApplicationHeaderButton[]}
   * @protected
   */
  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();

    // Only add edit mode toggle if the user can edit the document
    if (this.isEditable) {
      const isEditMode = this._isEditMode();

      buttons.unshift({
        label: isEditMode
          ? 'DASU.Actor.EditMode.View'
          : 'DASU.Actor.EditMode.Edit',
        class: `toggle-edit-mode ${isEditMode ? 'active' : ''}`,
        icon: isEditMode ? 'fas fa-eye' : 'fas fa-edit',
        onclick: () => this._toggleEditMode(),
      });
    }

    return buttons;
  }

  /**
   * Toggle edit mode for the actor sheet
   * @protected
   */
  async _toggleEditMode() {
    const currentMode = this._isEditMode();
    const newMode = !currentMode;

    await this.document.setFlag('dasu', 'editMode', newMode);

    // Re-render the sheet to update the UI
    await this.render();
  }

  /**
   * Check if the sheet is in edit mode
   * @returns {boolean}
   * @protected
   */
  _isEditMode() {
    return this.document.getFlag('dasu', 'editMode') !== false;
  }

  /**
   * Organize and classify Items for Actor sheets.
   *
   * @param {object} context The context object to mutate
   */
  async _prepareItems(context) {
    // Initialize containers.
    // You can just use `this.document.itemTypes` instead
    // if you don't need to subdivide a given type like
    // this sheet does with spells
    const weapons = [];
    const tags = [];
    const techniques = [];
    const spells = [];
    const afflictions = [];
    const restoratives = [];
    const tactics = [];
    const specials = [];
    const scars = [];

    // Iterate through items, allocating to containers
    for (let i of this.document.items) {
      // Append to abilities.
      if (i.type === 'ability') {
        // Handle different ability categories
        if (i.system.category === 'spell') {
          // Spells are now abilities with category "spell"
          spells.push(i);
        } else if (i.system.category === 'affliction') {
          afflictions.push(i);
        } else if (i.system.category === 'restorative') {
          restoratives.push(i);
        } else if (i.system.category === 'technique') {
          techniques.push(i);
        }
        // Note: General abilities (no category) are not displayed in the items tab
        // They would be shown in the main tab if needed
      }
      // Append to weapons.
      else if (i.type === 'weapon') {
        weapons.push(i);
      }
      // Append to tags.
      else if (i.type === 'tag') {
        tags.push(i);
      }
      // Append to techniques (legacy - now handled as abilities with category "technique").
      else if (i.type === 'technique') {
        techniques.push(i);
      }
      // Append to spells (legacy - now handled as abilities with category "spell").
      else if (i.type === 'spell') {
        spells.push(i);
      }
      // Append to afflictions (legacy - now handled as abilities with category "affliction").
      else if (i.type === 'affliction') {
        afflictions.push(i);
      }
      // Append to restoratives (legacy - now handled as abilities with category "restorative").
      else if (i.type === 'restorative') {
        restoratives.push(i);
      }
      // Append to tactics.
      else if (i.type === 'tactic') {
        tactics.push(i);
      }
      // Append to specials.
      else if (i.type === 'special') {
        specials.push(i);
      }
      // Append to scars.
      else if (i.type === 'scar') {
        scars.push(i);
      }
    }

    // Sort then assign
    context.weapons = weapons.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    context.tags = tags.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    context.techniques = techniques.sort(
      (a, b) => (a.sort || 0) - (b.sort || 0)
    );
    context.spells = spells.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    context.afflictions = afflictions.sort(
      (a, b) => (a.sort || 0) - (b.sort || 0)
    );
    context.restoratives = restoratives.sort(
      (a, b) => (a.sort || 0) - (b.sort || 0)
    );
    context.tactics = tactics.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    context.specials = specials.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    context.scars = scars.sort((a, b) => (a.sort || 0) - (b.sort || 0));

    // Prepare daemons for summoners
    if (this.document.type === 'summoner') {
      // Get daemons from the stocks field
      const stocks = this.document.system.stocks || [];
      const daemons = [];

      for (const stock of stocks) {
        if (stock.references?.actor) {
          const actor = game.actors.get(stock.references.actor);
          if (actor && actor.type === 'daemon') {
            daemons.push({
              _id: actor.id,
              name: actor.name,
              img: actor.img,
              type: actor.type,
              isSummoned: stock.references.isSummoned || false,
            });
          }
        }
      }

      context.daemons = daemons.sort((a, b) =>
        (a.name || '').localeCompare(b.name || '')
      );

      // Prepare skills for summoners
      let skills = this.document.system.skills || [];

      // Initialize default skills if none exist or if they have empty names
      if (
        skills.length === 0 ||
        skills.some((skill) => !skill.name || !skill.id)
      ) {
        const SummonerDataModel = CONFIG.Actor.dataModels.summoner;
        const defaultSkills = SummonerDataModel.getDefaultSkills();
        await this.document.update({ 'system.skills': defaultSkills });
        skills = defaultSkills;
      }

      // Calculate skill points AFTER skills are initialized
      const level = this.document.system.level || 1;
      const SummonerDataModel = CONFIG.Actor.dataModels.summoner;
      const skillPointsData = SummonerDataModel.getSkillPointsData(
        level,
        skills
      );

      // Add skill points data to context for template
      context.skillPoints = skillPointsData;
      context.skills = skills;

      // Calculate skill costs for tooltips (cumulative: 0+1+2+3+4+5+6 = 21 SP for 6 ticks)
      const skillCosts = {};
      skillCosts[0] = 0; // 0 ticks cost 0 SP
      for (let i = 1; i <= 6; i++) {
        // Calculate cumulative cost: 0+1+2+...+i
        skillCosts[i] = (i * (i + 1)) / 2; // Sum of 1 to i
      }
      context.skillCosts = skillCosts;
    } else {
      context.daemons = [];
      context.skills = [];
    }
  }

  /**
   * Actions performed after any render of the Application.
   * Post-render steps are not awaited by the render process.
   * @param {ApplicationRenderContext} context      Prepared context data
   * @param {RenderOptions} options                 Provided render options
   * @protected
   * @override
   */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#disableOverrides();

    // Add click handlers for skill radio buttons
    this.element.querySelectorAll('.skill-tick-radio').forEach((radio) => {
      // Remove any existing listeners to prevent duplicates
      radio.removeEventListener('click', this._handleSkillRadioClick);
      radio.removeEventListener('change', this._handleSkillRadioChange);
      radio.removeEventListener(
        'contextmenu',
        this._handleSkillRadioRightClick
      );

      // Add new listeners
      radio.addEventListener('click', this._handleSkillRadioClick.bind(this));
      radio.addEventListener('change', this._handleSkillRadioChange.bind(this));
      radio.addEventListener(
        'contextmenu',
        this._handleSkillRadioRightClick.bind(this)
      );
    });

    // Add change handlers for other form fields
    this.element
      .querySelectorAll('input[data-dtype], select[data-dtype]')
      .forEach((input) => {
        // Skip radio buttons as they're handled separately
        if (input.type === 'radio') return;

        // Remove any existing listeners to prevent duplicates
        input.removeEventListener('change', this._handleManualSubmit);
        input.removeEventListener('blur', this._handleManualSubmit);

        // Add new listeners
        input.addEventListener('change', this._handleManualSubmit.bind(this));
        input.addEventListener('blur', this._handleManualSubmit.bind(this));
      });

    // Add form submit handler
    const form = this.element.querySelector('form');
    if (form) {
      form.removeEventListener('submit', this._handleFormSubmit);
      form.addEventListener('submit', this._handleFormSubmit.bind(this));
    }
  }

  /**
   * Handle skill radio button right-click events (reset to 0)
   * @param {Event} event The contextmenu event
   * @private
   */
  async _handleSkillRadioRightClick(event) {
    // Prevent default context menu
    event.preventDefault();
    event.stopPropagation();

    const skillIndex = parseInt(event.target.dataset.skillIndex);

    try {
      // Get current skills array
      const currentSkills = [...this.actor.system.skills];

      // Reset the specific skill to 0 ticks
      if (currentSkills[skillIndex]) {
        currentSkills[skillIndex] = {
          ...currentSkills[skillIndex],
          ticks: 0,
        };
      }

      // Update the entire skills array
      await this.actor.update({ 'system.skills': currentSkills });

      // Force a re-render to show the updated values
      this.render(true);
    } catch (error) {
      console.error('Error resetting skill ticks:', error);
    }
  }

  /**
   * Handle skill radio button click events
   * @param {Event} event The click event
   * @private
   */
  _handleSkillRadioClick(event) {
    // Prevent any interference with the radio button selection
    event.stopPropagation();
    event.preventDefault();

    // Force the radio button to be checked
    event.target.checked = true;

    // Manually trigger the change event
    const changeEvent = new Event('change', { bubbles: true });
    event.target.dispatchEvent(changeEvent);
  }

  /**
   * Handle skill radio button change events
   * @param {Event} event The change event
   * @private
   */
  async _handleSkillRadioChange(event) {
    // Prevent form submission
    event.stopPropagation();
    event.preventDefault();

    // Only proceed if the radio is actually checked
    if (!event.target.checked) {
      return;
    }

    // Manually update the actor data
    const skillIndex = parseInt(event.target.dataset.skillIndex);
    const tickValue = parseInt(event.target.value);

    try {
      // Get current skills array
      const currentSkills = [...this.actor.system.skills];

      // Update the specific skill
      if (currentSkills[skillIndex]) {
        currentSkills[skillIndex] = {
          ...currentSkills[skillIndex],
          ticks: tickValue,
        };
      }

      // Update the entire skills array
      await this.actor.update({ 'system.skills': currentSkills });

      // Force a re-render to show the updated values
      this.render(true);
    } catch (error) {
      console.error('Error updating skill ticks:', error);
    }
  }

  /**
   * Handle form submission
   * @param {SubmitEvent} event The form submit event
   * @private
   */
  async _handleFormSubmit(event) {
    // Prevent default form submission
    event.preventDefault();

    // Get form data
    const formData = new FormData(event.target);
    const submitData = {};

    for (const [key, value] of formData.entries()) {
      // Skip radio buttons as they're handled separately
      if (key.includes('skill-tick-radio')) continue;

      // Convert value based on data type
      const input = event.target.querySelector(`[name="${key}"]`);
      const fieldType = input?.dataset.dtype || 'String';

      let processedValue = value;
      if (fieldType === 'Number') {
        processedValue = parseFloat(value) || 0;
      } else if (fieldType === 'Boolean') {
        processedValue = value === 'true';
      }

      submitData[key] = processedValue;
    }

    // Update the actor
    try {
      await this.actor.update(submitData);
    } catch (error) {
      console.error('Error updating form data:', error);
    }
  }

  /**************
   *
   *   ACTIONS
   *
   **************/

  /**
   * Handle changing a Document's image.
   *
   * @this DASUActorSheet
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
   * @this DASUActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _viewDoc(event, target) {
    const doc = this._getEmbeddedDocument(target);
    doc.sheet.render(true);
  }

  /**
   * Handles item deletion
   *
   * @this DASUActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _deleteDoc(event, target) {
    const doc = this._getEmbeddedDocument(target);
    await doc.delete();
  }

  /**
   * Create a new embedded Document within this parent Document
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _createDoc(event, target) {
    // Retrieve the configured document class for Item or ActiveEffect
    const docCls = getDocumentClass(target.dataset.documentClass);
    // Prepare the document creation data by initializing it a default name.
    // As of v12, you can define custom Active Effect subtypes just like Item subtypes if you want
    const docData = {
      name: docCls.defaultName({
        // defaultName handles an undefined type gracefully
        type: target.dataset.type,
        parent: this.actor,
      }),
    };

    // Loop through the dataset and add it to our docData
    for (const [dataKey, value] of Object.entries(target.dataset)) {
      // These data attributes are reserved for the action handling
      if (['action', 'documentClass'].includes(dataKey)) continue;

      // Handle special case for data-system-category
      if (dataKey === 'systemCategory') {
        docData.system = docData.system || {};
        docData.system.category = value;
        continue;
      }

      // Nested properties require dot notation in the HTML, e.g. anything with `system`
      // An example exists in spells.hbs, with `data-system.spell-level`
      // which turns into the dataKey 'system.spellLevel'
      foundry.utils.setProperty(docData, dataKey, value);
    }

    // Set category for ability items since they require subcategorization
    if (target.dataset.type === 'ability') {
      docData.system = docData.system || {};
      // If a category was specified in the data attributes, use it
      if (!docData.system.category) {
        // Otherwise use the first category from config
        docData.system.category = globalThis.DASU.ABILITY_CATEGORIES[0];
      }
    }

    // Set default values for tactics to fix validation errors
    if (target.dataset.type === 'tactic') {
      docData.system = docData.system || {};
      docData.system.govern = docData.system.govern || 'pow';
      docData.system.damage = docData.system.damage || {};
      docData.system.damage.value = docData.system.damage.value || 0;
      docData.system.damage.type = docData.system.damage.type || 'physical';
      docData.system.toLand = docData.system.toLand || 0;
      docData.system.cost = docData.system.cost || 0;
      docData.system.effect = docData.system.effect || '';
    }

    // Set default values for specials
    if (target.dataset.type === 'special') {
      docData.system = docData.system || {};
      docData.system.specialType = docData.system.specialType || 'ability';
      docData.system.cost = docData.system.cost || 0;
      docData.system.duration = docData.system.duration || 0;
      docData.system.requirements = docData.system.requirements || '';
      docData.system.effect = docData.system.effect || '';
    }

    // Finally, create the embedded document!
    const createdDoc = await docCls.create(docData, { parent: this.actor });
    return createdDoc;
  }

  /**
   * Toggle the summoned status of a daemon in stocks
   *
   * @this DASUActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _toggleSummoned(event, target) {
    const daemonId = target.closest('li[data-actor-id]').dataset.actorId;
    const stocks = this.actor.system.stocks || [];
    const stockIndex = stocks.findIndex(
      (stock) => stock.references?.actor === daemonId
    );

    if (stockIndex === -1) return;

    const currentStock = stocks[stockIndex];
    const newIsSummoned = !currentStock.references.isSummoned;

    const updatedStocks = [...stocks];
    updatedStocks[stockIndex] = {
      ...currentStock,
      references: {
        ...currentStock.references,
        isSummoned: newIsSummoned,
      },
    };

    await this.actor.update({ 'system.stocks': updatedStocks });
  }

  /**
   * Remove a daemon from the summoner's stocks
   *
   * @this DASUActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _removeFromStock(event, target) {
    const daemonId = target.closest('li[data-actor-id]').dataset.actorId;
    const stocks = this.actor.system.stocks || [];
    const updatedStocks = stocks.filter(
      (stock) => stock.references?.actor !== daemonId
    );

    await this.actor.update({ 'system.stocks': updatedStocks });
  }

  /**
   * Determines effect parent to pass to helper
   *
   * @this DASUActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _toggleEffect(event, target) {
    const effect = this._getEmbeddedDocument(target);
    await effect.update({ disabled: !effect.disabled });
  }

  /**
   * Handle clickable rolls.
   *
   * @this DASUActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _onRoll(event, target) {
    event.preventDefault();
    const dataset = target.dataset;

    // Handle item rolls.
    switch (dataset.rollType) {
      case 'item':
        const item = this._getEmbeddedDocument(target);
        if (item) return item.roll();
    }

    // Handle rolls that supply the formula directly.
    if (dataset.roll) {
      let label = dataset.label ? `${dataset.label}` : '';
      let roll = new Roll(dataset.roll, this.actor.getRollData());

      // For DASU success-based rolls
      if (label.includes('Check')) {
        // This is a DASU success-based roll
        await roll.evaluate();
        let successes = 0;
        let rollResults = [];

        // Count successes (4-6) from the roll results and collect all results
        if (roll.dice && roll.dice.length > 0) {
          for (const die of roll.dice) {
            if (die.results) {
              for (const result of die.results) {
                rollResults.push(result.result);
                if (result.result >= 4 && result.result <= 6) {
                  successes++;
                }
              }
            }
          }
        }

        // Play roll sound
        AudioHelper.play({ src: CONFIG.sounds.dice });

        // Create a more detailed message with roll results
        const successText = successes === 1 ? 'success' : 'successes';
        const flavor = `${label}<br><strong>Roll: [${rollResults.join(
          ', '
        )}]</strong><br><strong>Result: ${successes} ${successText}</strong>`;

        const messageData = {
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          flavor: flavor,
          roll: roll,
          rollMode: game.settings.get('core', 'rollMode'),
        };

        await ChatMessage.create(messageData);
        return roll;
      } else {
        // Regular roll
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          flavor: label,
          rollMode: game.settings.get('core', 'rollMode'),
        });
        return roll;
      }
    }
  }

  /** Helper Functions */

  /**
   * Fetches the embedded document representing the containing HTML element
   *
   * @param {HTMLElement} target    The element subject to search
   * @returns {Item | ActiveEffect | Actor} The embedded Item, ActiveEffect, or Actor
   */
  _getEmbeddedDocument(target) {
    const docRow = target.closest('li[data-document-class]');
    if (docRow.dataset.documentClass === 'Item') {
      return this.actor.items.get(docRow.dataset.itemId);
    } else if (docRow.dataset.documentClass === 'ActiveEffect') {
      const parent =
        docRow.dataset.parentId === this.actor.id
          ? this.actor
          : this.actor.items.get(docRow?.dataset.parentId);
      return parent.effects.get(docRow?.dataset.effectId);
    } else if (docRow.dataset.documentClass === 'Actor') {
      return game.actors.get(docRow.dataset.actorId);
    } else return console.warn('Could not find document class');
  }

  /***************
   *
   * Drag and Drop
   *
   ***************/

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
    if (!this.actor.isOwner || !effect) return false;
    if (effect.target === this.actor)
      return this._onSortActiveEffect(event, effect);
    return aeCls.create(effect, { parent: this.actor });
  }

  /**
   * Handle a drop event for an existing embedded Active Effect to sort that Active Effect relative to its siblings
   *
   * @param {DragEvent} event
   * @param {ActiveEffect} effect
   */
  async _onSortActiveEffect(event, effect) {
    /** @type {HTMLElement} */
    const dropTarget = event.target.closest('[data-effect-id]');
    if (!dropTarget) return;
    const target = this._getEmbeddedDocument(dropTarget);

    // Don't sort on yourself
    if (effect.uuid === target.uuid) return;

    // Identify sibling items based on adjacent HTML elements
    const siblings = [];
    for (const el of dropTarget.parentElement.children) {
      const siblingId = el.dataset.effectId;
      const parentId = el.dataset.parentId;
      if (
        siblingId &&
        parentId &&
        (siblingId !== effect.id || parentId !== effect.parent.id)
      )
        siblings.push(this._getEmbeddedDocument(el));
    }

    // Perform the sort
    const sortUpdates = SortingHelpers.performIntegerSort(effect, {
      target,
      siblings,
    });

    // Split the updates up by parent document
    const directUpdates = [];

    const grandchildUpdateData = sortUpdates.reduce((items, u) => {
      const parentId = u.target.parent.id;
      const update = { _id: u.target.id, ...u.update };
      if (parentId === this.actor.id) {
        directUpdates.push(update);
        return items;
      }
      if (items[parentId]) items[parentId].push(update);
      else items[parentId] = [update];
      return items;
    }, {});

    // Effects-on-items updates
    for (const [itemId, updates] of Object.entries(grandchildUpdateData)) {
      await this.actor.items
        .get(itemId)
        .updateEmbeddedDocuments('ActiveEffect', updates);
    }

    // Update on the main actor
    return this.actor.updateEmbeddedDocuments('ActiveEffect', directUpdates);
  }

  /**
   * Handle dropping of an Actor data onto another Actor sheet
   * @param {DragEvent} event            The concluding DragEvent which contains drop data
   * @param {object} data                The data transfer extracted from the event
   * @returns {Promise<object|boolean>}  A data object which describes the result of the drop, or false if the drop was
   *                                     not permitted.
   * @protected
   */
  async _onDropActor(event, data) {
    if (!this.actor.isOwner) return false;

    // Only allow dropping daemons onto summoners
    if (this.actor.type !== 'summoner') return false;

    const actor = await Actor.implementation.fromDropData(data);
    if (!actor || actor.type !== 'daemon') return false;

    // Check if daemon is already in stocks
    const stocks = this.actor.system.stocks || [];
    const existingStock = stocks.find(
      (stock) => stock.references?.actor === actor.id
    );

    if (existingStock) {
      ui.notifications.warn('This daemon is already in your stocks');
      return false;
    }

    // Add daemon to stocks
    const newStock = {
      references: {
        actor: actor.id,
        isSummoned: false,
      },
    };

    const updatedStocks = [...stocks, newStock];
    await this.actor.update({ 'system.stocks': updatedStocks });

    ui.notifications.info(`Added ${actor.name} to your stocks`);

    // Refresh the sheet to show the new daemon
    this.render(true);

    return true;
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
    if (!this.actor.isOwner) return [];
    const folder = await Folder.implementation.fromDropData(data);
    if (folder.type !== 'Item') return [];
    const droppedItemData = await Promise.all(
      folder.contents.map(async (item) => {
        if (!(document instanceof Item)) item = await fromUuid(item.uuid);
        return item;
      })
    );
    return this._onDropItemCreate(droppedItemData, event);
  }

  /**
   * Handle the final creation of dropped Item data on the Actor.
   * This method is factored out to allow downstream classes the opportunity to override item creation behavior.
   * @param {object[]|object} itemData      The item data requested for creation
   * @param {DragEvent} event               The concluding DragEvent which provided the drop data
   * @returns {Promise<Item[]>}
   * @private
   */
  async _onDropItemCreate(itemData, event) {
    itemData = itemData instanceof Array ? itemData : [itemData];
    return this.actor.createEmbeddedDocuments('Item', itemData);
  }

  /********************
   *
   * Actor Override Handling
   *
   ********************/

  /**
   * Submit a document update based on the processed form data.
   * @param {SubmitEvent} event                   The originating form submission event
   * @param {HTMLFormElement} form                The form element that was submitted
   * @param {object} submitData                   Processed and validated form data to be used for a document update
   * @returns {Promise<void>}
   * @protected
   * @override
   */
  async _processSubmitData(event, form, submitData) {
    const overrides = foundry.utils.flattenObject(this.actor.overrides);
    for (let k of Object.keys(overrides)) delete submitData[k];
    await this.document.update(submitData);
  }

  /**
   * Handle manual form submission for fields that need it
   * @param {Event} event The input event
   * @private
   */
  async _handleManualSubmit(event) {
    // Only handle non-radio button inputs
    if (event.target.classList.contains('skill-tick-radio')) {
      return;
    }

    // Get the form data for this specific field
    const fieldName = event.target.name;
    const fieldValue = event.target.value;
    const fieldType = event.target.dataset.dtype || 'String';

    // Convert value based on data type
    let processedValue = fieldValue;
    if (fieldType === 'Number') {
      processedValue = parseFloat(fieldValue) || 0;
    } else if (fieldType === 'Boolean') {
      processedValue = fieldValue === 'true';
    }

    // Update the actor
    try {
      await this.actor.update({ [fieldName]: processedValue });
    } catch (error) {
      console.error('Error updating field:', fieldName, error);
    }
  }

  /**
   * Disables inputs subject to active effects
   */
  #disableOverrides() {
    const flatOverrides = foundry.utils.flattenObject(this.actor.overrides);
    for (const override of Object.keys(flatOverrides)) {
      const input = this.element.querySelector(`[name="${override}"]`);
      if (input) {
        input.disabled = true;
      }
    }
  }

  /**
   * Handle leveling up the actor
   * @this DASUActorSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _levelUp(event, target) {
    if (!['daemon', 'summoner'].includes(this.document.type)) return;
    await this.document.levelUp();
  }
}
