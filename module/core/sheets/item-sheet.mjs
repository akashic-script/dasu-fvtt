import { prepareActiveEffectCategories } from '../../systems/effects/display.mjs';
import DASU from '../../utils/config.mjs';
import { registerHandlebarsHelpers } from '../../utils/helpers.mjs';
registerHandlebarsHelpers();

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
      toggleProgressionPreview: this._toggleProgressionPreview,
    },
    form: {
      submitOnChange: true,
      closeOnSubmit: false,
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
    attributesSchema: {
      template: 'systems/dasu/templates/item/attribute-parts/schema.hbs',
      scrollable: [''],
    },
    attributesFeature: {
      template: 'systems/dasu/templates/item/attribute-parts/feature.hbs',
      scrollable: [''],
    },
    attributesClass: {
      template: 'systems/dasu/templates/item/attribute-parts/class.hbs',
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

    // Debug logging
    // console.log('Item sheet type:', this.document.type);
    // console.log('Item sheet limited:', this.document.limited);

    // Control which parts show based on document subtype
    switch (this.document.type) {
      case 'ability':
        // Always use attributesAbility for all ability items
        // Category-specific rendering is handled within the ability template
        options.parts.push('attributesAbility', 'effects');

        break;
      case 'weapon':
        options.parts.push('attributesWeapon', 'effects');

        break;
      case 'tag':
        options.parts.push('attributesTag', 'effects');

        break;
      case 'tactic':
        options.parts.push('attributesTactic', 'effects');

        break;
      case 'special':
        options.parts.push('attributesSpecial', 'effects');

        break;
      case 'scar':
        options.parts.push('attributesScar', 'effects');

        break;
      case 'schema':
        options.parts.push('attributesSchema', 'effects');
        break;
      case 'feature':
        options.parts.push('attributesFeature', 'effects');
        break;
      case 'class':
        options.parts.push('attributesClass', 'effects');
        break;
    }
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
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
          `DASU.Item.Ability.CATEGORIES.${category}`
        );
      });
    }

    if (this.document.type === 'weapon') {
      context.rangeTypes = {
        melee: 'Melee',
        ranged: 'Ranged',
      };
      // Add usedTagSlots for tag slot header
      const tagSlots = this.item.system.tagSlots || {};
      context.usedTagSlots = Object.values(tagSlots).filter(
        (slot) => slot.tagId
      ).length;
    }

    // Add cost type and heal type options from config
    context.costTypeOptions = DASU.COST_TYPE_OPTIONS;
    context.healTypeOptions = DASU.HEAL_TYPE_OPTIONS;

    // Add system fields for formInput
    context.fields = this.document.schema.fields;
    context.systemFields = this.document.system.schema.fields;

    // Add HTMLField for formInput helper
    context.htmlInputField = new foundry.data.fields.HTMLField();

    // Add enriched description for display mode
    context.enrichedDescription =
      await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        this.item.system.description || '',
        {
          secrets: this.document.isOwner,
          rollData: this.item.getRollData(),
          relativeTo: this.item,
        }
      );

    return context;
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    switch (partId) {
      case 'attributesAbility':
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
            `DASU.Item.Ability.CATEGORIES.${category}`
          );
        });
        // Add attribute options for attribute tick
        context.attributeOptions = [
          { value: 'pow', label: 'DASU.Attributes.pow.label' },
          { value: 'dex', label: 'DASU.Attributes.dex.label' },
          { value: 'will', label: 'DASU.Attributes.will.label' },
          { value: 'sta', label: 'DASU.Attributes.sta.label' },
        ];
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
        context.tab = context.tabs[partId];
        let allowedTypes = Array.from(globalThis.DASU_TAGGABLE_TYPES || []);
        allowedTypes = allowedTypes.filter((t) => t !== 'general');
        if (!allowedTypes.includes('all')) allowedTypes.unshift('all');
        context.allowedTypes = allowedTypes;
        context.rarityOptions = DASU.RARITY_OPTIONS;
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
      case 'attributesScar':
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
      case 'attributesWeapon':
        // Necessary for preserving active tab on re-render
        context.tab = context.tabs[partId];
        // Use config.mjs for damage types
        context.damageTypes = DASU.damageTypes;

        // Get tags from the parent actor first
        let parentActor = null;

        // Try to get parent actor through different methods
        if (this.item.actor) {
          parentActor = this.item.actor;
        } else if (
          this.item.parent &&
          this.item.parent.documentName === 'Actor'
        ) {
          parentActor = this.item.parent;
        }

        let availableTags = [];
        if (parentActor) {
          const tagItems = parentActor.items.filter(
            (item) => item.type === 'tag'
          );
          availableTags = tagItems.map((tag) => ({
            _id: tag._id,
            name: tag.name,
            type: tag.type,
            img: tag.img,
          }));
        } else {
          // Fallback to all tags in the world if no parent actor
          const tagItems = game.items.filter((item) => item.type === 'tag');
          availableTags = tagItems.map((tag) => ({
            _id: tag._id,
            name: tag.name,
            type: tag.type,
            img: tag.img,
          }));
        }

        // Add tag slots data
        const tagSlots = this.item.system.tagSlots || {};
        const processedTagSlots = {};

        // Dynamically process all slots in tagSlots
        for (const [slotKey, slot] of Object.entries(tagSlots)) {
          // Skip slots with invalid keys
          if (!slotKey || slotKey === 'undefined') {
            continue;
          }

          // Try to get tag from actor's items first, then from global items
          let tag = null;
          if (slot.tagId) {
            if (this.item.actor) {
              tag = this.item.actor.items.get(slot.tagId);
            }
            if (!tag) {
              tag = game.items.get(slot.tagId);
            }
          }

          // If tag doesn't exist but we have a tagName, create a fallback tag object
          let tagToDisplay = null;
          if (tag) {
            tagToDisplay = {
              _id: tag._id,
              name: tag.name,
              img: tag.img,
              system: tag.system,
              isInvalid: false,
            };
          } else if (slot.tagName) {
            tagToDisplay = {
              _id: slot.tagId || 'deleted',
              name: slot.tagName,
              img: 'icons/svg/item-bag.svg',
              system: { maxRank: slot.maxRank || 1 },
              isInvalid: true, // Only mark as invalid if not found anywhere
            };
          }

          // Filter out tags that are already equipped in other slots
          const equippedTagIds = Object.entries(tagSlots)
            .filter(
              ([otherSlotKey, otherSlot]) =>
                otherSlotKey !== slotKey && otherSlot.tagId
            )
            .map(([_otherSlotKey, otherSlot]) => otherSlot.tagId);

          const availableTagsForSlot = availableTags.filter(
            (tag) => !equippedTagIds.includes(tag._id)
          );

          processedTagSlots[slotKey] = {
            ...slot,
            tag: tagToDisplay,
            slotNumber: slotKey.replace('slot', ''),
            availableTags: availableTagsForSlot, // Add filtered availableTags to each slot
          };
        }

        context.tagSlots = processedTagSlots;
        context.availableTags = availableTags;

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
        // Necessary for preserving active tab on re-render
        context.tab = context.tabs[partId];
        // Add damage types for select dropdown
        context.damageTypes = DASU.damageTypes;
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
      case 'attributesClass':
        context.tab = context.tabs[partId];
        // Add class categories from config
        context.classCategories = {};
        const classCategories = globalThis.DASU?.CLASS_CATEGORIES || [
          'official',
          'community',
          'homebrew',
        ];
        classCategories.forEach((category) => {
          context.classCategories[category] = game.i18n.localize(
            `DASU.Class.Category.${category}`
          );
        });

        // Add level slot types for the dropdown
        context.levelBonusTypes = {
          ability: game.i18n.localize(
            'DASU.Actor.levelingWizard.slots.ability'
          ),
          schema: game.i18n.localize('DASU.Actor.levelingWizard.slots.schema'),
          feature: game.i18n.localize(
            'DASU.Actor.levelingWizard.slots.feature'
          ),
        };

        // Add attribute options for starting attributes
        context.attributeOptions = {
          pow: game.i18n.localize('DASU.Actor.Attributes.list.pow.label'),
          dex: game.i18n.localize('DASU.Actor.Attributes.list.dex.label'),
          will: game.i18n.localize('DASU.Actor.Attributes.list.will.label'),
          sta: game.i18n.localize('DASU.Actor.Attributes.list.sta.label'),
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
      case 'attributesSpecial':
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
      case 'attributesSchema':
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
      case 'attributesFeature':
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
      case 'effects':
        context.tab = context.tabs[partId];
        // Prepare active effects for easier access
        context.effects = prepareActiveEffectCategories(this.item.effects);
        break;
      default:
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
        case 'attributesSchema':
        case 'attributesFeature':
        case 'attributesClass':
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

    // Add action handlers for tag slots
    this.element
      .querySelectorAll('[data-action="addTag"]')
      .forEach((element) => {
        element.addEventListener('change', (event) =>
          this._addTag(event, event.target)
        );
      });

    this.element
      .querySelectorAll('[data-action="removeTag"]')
      .forEach((element) => {
        element.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          this._removeTag(event, element);
        });
      });

    this.element
      .querySelectorAll('[data-action="updateTagRank"]')
      .forEach((element) => {
        element.addEventListener('change', (event) =>
          this._updateTagRank(event, event.target)
        );
      });

    this.element
      .querySelectorAll('[data-action="clearInvalidTag"]')
      .forEach((element) => {
        element.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          this._clearInvalidTag(event, element);
        });
      });

    // Add drop event handlers for tag slots
    this.element
      .querySelectorAll('[data-drop-zone="tag-slot"]')
      .forEach((element) => {
        element.addEventListener('dragover', (event) =>
          this._handleDragOver(event, element)
        );
        element.addEventListener('dragleave', (event) =>
          this._handleDragLeave(event, element)
        );
        element.addEventListener('drop', (event) =>
          this._handleDrop(event, element)
        );
      });

    // Add action handlers for tag effects
    if (this.document.type === 'tag') {
      this.element
        .querySelectorAll('[data-action="addEffect"]')
        .forEach((element) => {
          element.addEventListener('click', (event) =>
            this._addEffect(event, event.target)
          );
        });

      this.element
        .querySelectorAll('[data-action="removeEffect"]')
        .forEach((element) => {
          element.addEventListener('click', (event) =>
            this._removeEffect(event, event.target)
          );
        });
    }

    // Add action handlers for class level slots
    if (this.document.type === 'class') {
      // Add slot type to level
      this.element.querySelectorAll('.add-slot-type').forEach((element) => {
        element.addEventListener('change', (event) =>
          this._addSlotType(event, event.target)
        );
      });

      // Remove slot type from level - use direct event listeners on buttons
      this.element.querySelectorAll('.remove-slot-type').forEach((element) => {
        element.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          // Prevent multiple rapid clicks
          if (element.disabled) return;
          element.disabled = true;
          this._removeSlotType(event, element).finally(() => {
            if (element) element.disabled = false;
          });
        });
      });

      // Handle inline editing of schema slot details
      this.element.addEventListener('input', (event) => {
        if (event.target.classList.contains('schema-slot-field')) {
          this._updateSchemaSlotField(event, event.target);
        }
      });

      // Handle schema slot action dropdown changes
      this.element
        .querySelectorAll('.slot-action-select')
        .forEach((element) => {
          element.addEventListener('change', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this._updateSchemaSlotAction(event, event.target);
          });
        });

      // Handle schema upgrade target dropdown changes
      this.element
        .querySelectorAll('.slot-upgrade-target')
        .forEach((element) => {
          element.addEventListener('change', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this._updateSchemaSlotUpgradeTarget(event, event.target);
          });
        });

      // Handle slot number input changes
      this.element.querySelectorAll('.slot-number-input').forEach((element) => {
        element.addEventListener('change', (event) => {
          event.preventDefault();
          event.stopPropagation();
          this._updateSchemaSlotNumber(event, event.target);
        });
      });
    }

    // Tag allowed types handlers (for tag items only)
    if (this.document.type === 'tag') {
      // Remove tag type
      this.element
        .querySelectorAll('[data-action="removeTagType"]')
        .forEach((el) => {
          el.addEventListener('click', (ev) => {
            const type = ev.currentTarget.dataset.type;
            let slotType = Array.from(this.document.system.slotType || []);
            slotType = slotType.filter((t) => t !== type);
            this.document.update({ 'system.slotType': slotType });
          });
        });
      // Dropdown logic for add button
      const addBtn = this.element.querySelector('.add-tag-type-btn');
      const dropdown = this.element.querySelector('.tag-type-dropdown');
      if (addBtn && dropdown) {
        addBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          dropdown.classList.toggle('visible');
        });
        // Add tag type from dropdown
        dropdown.querySelectorAll('.dropdown-item').forEach((item) => {
          item.addEventListener('click', (ev) => {
            const type = ev.currentTarget.dataset.type;
            let slotType = Array.from(this.document.system.slotType || []);
            if (!slotType.includes(type)) slotType.push(type);
            this.document.update({ 'system.slotType': slotType });
            dropdown.classList.remove('visible');
          });
        });
        // Hide dropdown when clicking outside
        const hideDropdown = (e) => {
          if (!dropdown.contains(e.target) && e.target !== addBtn) {
            dropdown.classList.remove('visible');
          }
        };
        document.addEventListener('click', hideDropdown);
      }
    }

    // Add tag type from select
    this.element.querySelectorAll('.tag-type-select').forEach((el) => {
      el.addEventListener('change', (ev) => {
        const type = ev.currentTarget.value;
        if (!type) return;
        let slotType = Array.from(this.document.system.slotType || []);
        if (type === 'all') {
          slotType = ['all'];
        } else {
          slotType = slotType.filter((t) => t !== 'all');
          if (!slotType.includes(type)) slotType.push(type);
        }
        this.document.update({ 'system.slotType': slotType });
        // Reset select to default
        ev.currentTarget.value = '';
      });
    });
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

    // --- DASU PATCH: Use separate level fields for schema items ---
    if (this.document.type === 'schema') {
      for (let i = 1; i <= 3; i++) {
        let desc = foundry.utils.getProperty(
          processedData,
          `system.level${i}.description`
        );
        if (typeof desc !== 'string') desc = '';
        foundry.utils.setProperty(processedData, `system.level${i}`, {
          description: desc,
        });
      }
    }
    // --- END PATCH ---

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
  static async _onEditImage(_event, target) {
    const attr = target.dataset.edit;
    const current = foundry.utils.getProperty(this.document, attr);
    return foundry.applications.apps.FilePicker.browse('data', {
      current,
      type: 'image',
      callback: (path) => {
        this.document.update({ [attr]: path });
      },
    });
  }

  /**
   * Renders an embedded document's sheet
   *
   * @this DASUItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @protected
   */
  static async _viewEffect(_event, target) {
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
  static async _deleteEffect(_event, target) {
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
  static async _createEffect(_event, target) {
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
  static async _toggleEffect(_event, target) {
    const effect = this._getEffect(target);
    await effect.update({ disabled: !effect.disabled });
    // If this is a tag effect on a weapon, re-sync tag effects
    const item = effect.parent;
    if (item?.type === 'weapon' && effect.flags?.dasu?.sourceTag) {
      await item.resyncTagEffects();
    }
  }

  /**
   * Handle toggling the progression preview expand/collapse state
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _toggleProgressionPreview(event, target) {
    event.preventDefault();
    event.stopPropagation();

    const previewElement = target.closest('.progression-preview');
    if (!previewElement) return;

    const contentElement = previewElement.querySelector(
      '.progression-preview-content'
    );
    const iconElement = target.querySelector('i');

    if (!contentElement || !iconElement) return;

    const isCurrentlyHidden = contentElement.style.display === 'none';

    if (isCurrentlyHidden) {
      // Show content
      contentElement.style.display = '';
      iconElement.className = 'fas fa-chevron-up';
      target.title = 'Hide progression preview';
    } else {
      // Hide content
      contentElement.style.display = 'none';
      iconElement.className = 'fas fa-chevron-down';
      target.title = 'Show progression preview';
    }
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
    const data = foundry.utils.TextEditor.getDragEventData(event);
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
    const sortUpdates = foundry.utils.sortObjectEntries(effect, {
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
  async _onDropActor(_event, _data) {
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
  async _onDropItem(_event, _data) {
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
  async _onDropFolder(_event, _data) {
    if (!this.item.isOwner) return [];
  }

  /* -------------------------------------------- */

  /**
   * Handle adding a tag to a weapon slot
   * @param {Event} event The click event
   * @param {HTMLElement} target The target element
   * @returns {Promise<boolean>}
   * @protected
   */
  async _addTag(_event, target) {
    if (this.document.type !== 'weapon') {
      return false;
    }

    const slotKey = target.dataset.slotKey;
    const tagId = target.value;

    if (!tagId) {
      return false;
    }

    // Use the specific slot instead of finding the first available slot
    const success = await this.document.addTagToSlot(tagId, slotKey);
    if (success) {
      this.render(true);
    }
    return success;
  }

  /**
   * Handle removing a tag from a weapon slot
   * @param {Event} event The click event
   * @param {HTMLElement} target The target element
   * @returns {Promise<boolean>}
   * @protected
   */
  async _removeTag(event, target) {
    if (this.document.type !== 'weapon') {
      return false;
    }

    const slotKey = target.dataset.slotKey;
    const success = await this.document.removeTag(slotKey);
    if (success) {
      this.render(true);
    }
    return success;
  }

  /**
   * Handle updating a tag's rank in a weapon slot
   * @param {Event} event The change event
   * @param {HTMLElement} target The target element
   * @returns {Promise<boolean>}
   * @protected
   */
  async _updateTagRank(event, target) {
    if (this.document.type !== 'weapon') return false;

    const slotKey = target.dataset.slotKey;
    const newRank = parseInt(target.value) || 1;

    const success = await this.document.updateTagRank(slotKey, newRank);
    if (success) {
      this.render(true);
    }
    return success;
  }

  /**
   * Handle adding an effect to a tag
   * @param {Event} event The click event
   * @param {HTMLElement} target The target element
   * @returns {Promise<boolean>}
   * @protected
   */
  async _addEffect(event, target) {
    if (this.document.type !== 'tag') return false;

    const currentEffects = this.document.system.effects || [];
    const newEffect = {
      type: 'damage_bonus',
      value: '+1',
      description: '',
    };

    const updatedEffects = [...currentEffects, newEffect];

    const success = await this.document.update({
      'system.effects': updatedEffects,
    });
    if (success) {
      this.render(true);
    }
    return success;
  }

  /**
   * Handle removing an effect from a tag
   * @param {Event} event The click event
   * @param {HTMLElement} target The target element
   * @returns {Promise<boolean>}
   * @protected
   */
  async _removeEffect(event, target) {
    if (this.document.type !== 'tag') return false;

    const effectIndex = parseInt(target.dataset.effectIndex);
    const currentEffects = this.document.system.effects || [];

    if (effectIndex < 0 || effectIndex >= currentEffects.length) return false;

    const updatedEffects = currentEffects.filter(
      (_, index) => index !== effectIndex
    );

    const success = await this.document.update({
      'system.effects': updatedEffects,
    });
    if (success) {
      this.render(true);
    }
    return success;
  }

  // Add drop event handlers for tag slots
  /**
   * Handle drag over event for tag slots
   * @param {DragEvent} event The drag over event
   * @param {HTMLElement} element The drop zone element
   * @private
   */
  _handleDragOver(event, element) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';

    // Add visual feedback to the entire tag slot
    element.classList.add('drag-over');

    // Also add visual feedback to the drop zone if it exists
    const dropZone = element.querySelector('.drop-zone');
    if (dropZone) {
      dropZone.classList.add('drag-over');
    }
  }

  /**
   * Handle drag leave event for tag slots
   * @param {DragEvent} event The drag leave event
   * @param {HTMLElement} element The drop zone element
   * @private
   */
  _handleDragLeave(event, element) {
    // Remove visual feedback from the entire tag slot
    element.classList.remove('drag-over');

    // Also remove visual feedback from the drop zone if it exists
    const dropZone = element.querySelector('.drop-zone');
    if (dropZone) {
      dropZone.classList.remove('drag-over');
    }
  }

  /**
   * Handle drop event for tag slots
   * @param {DragEvent} event The drop event
   * @param {HTMLElement} element The drop zone element
   * @private
   */
  async _handleDrop(event, element) {
    event.preventDefault();

    // Remove visual feedback from the entire tag slot
    element.classList.remove('drag-over');

    // Also remove visual feedback from the drop zone if it exists
    const dropZone = element.querySelector('.drop-zone');
    if (dropZone) {
      dropZone.classList.remove('drag-over');
    }

    try {
      // Parse the dropped data
      const data = JSON.parse(event.dataTransfer.getData('application/json'));

      if (data.type === 'tag' && this.document.type === 'weapon') {
        const slotKey = element.dataset.slotKey;
        const tagId = data.itemId;

        // Check if the tag is from the same actor
        if (data.actorId === this.document.actor?.id) {
          // Check if the tag is already equipped in another slot
          const tagSlots = this.document.system.tagSlots || {};
          const isAlreadyEquipped = Object.entries(tagSlots).some(
            ([key, slot]) => {
              return key !== slotKey && slot.tagId === tagId;
            }
          );

          if (isAlreadyEquipped) {
            ui.notifications.warn(
              'This tag is already equipped in another slot'
            );
            return;
          }

          // Add the tag to the slot
          const success = await this.document.addTagToSlot(tagId, slotKey);
          if (success) {
            this.render(true);
            ui.notifications.info(
              `Tag dropped into slot ${slotKey.replace('slot', '')}`
            );
          }
        } else {
          ui.notifications.warn('You can only drop tags from the same actor');
        }
      }
    } catch (error) {
      console.error('Error handling tag drop:', error);
      ui.notifications.error('Failed to drop tag');
    }
  }

  /**
   * Handle clearing an invalid tag
   * @param {Event} event The click event
   * @param {HTMLElement} target The target element
   * @protected
   */
  async _clearInvalidTag(event, target) {
    if (this.document.type !== 'weapon') return;

    const slotKey = target.dataset.slotKey;
    const success = await this.document.removeTag(slotKey);
    if (success) {
      this.render(true);
    }
  }

  /**
   * Handle adding a slot type to a specific level
   * @param {Event} event The change event
   * @param {HTMLElement} target The target element
   * @returns {Promise<boolean>}
   * @protected
   */
  async _addSlotType(event, target) {
    if (this.document.type !== 'class') return false;

    const level = target.dataset.level;
    const slotType = target.value;

    if (!slotType) return false;

    // Get current level slots
    const levelSlots = foundry.utils.deepClone(
      this.document.system.levelSlots || {}
    );

    // Initialize array for this level if it doesn't exist
    if (!levelSlots[level]) {
      levelSlots[level] = [];
    }

    // Handle schema slots with enhanced structure
    if (slotType === 'schema') {
      // For schema slots, we need to prompt for additional details or use defaults
      const schemaSlot = {
        type: 'schema',
        schemaId: '', // To be filled by user later
        action: 'new', // Default to new schema
      };

      // Check if this exact schema slot already exists
      const existingSchemaSlot = levelSlots[level].find(
        (slot) => typeof slot === 'object' && slot.type === 'schema'
      );

      if (!existingSchemaSlot) {
        levelSlots[level].push(schemaSlot);
      }
    } else {
      // For simple slot types, check if it already exists
      if (!levelSlots[level].includes(slotType)) {
        levelSlots[level].push(slotType);
      }
    }

    // Update the document
    await this.document.update({ 'system.levelSlots': levelSlots });

    // Reset the select value
    target.value = '';

    this.render(true);
    return true;
  }

  /**
   * Handle removing a slot type from a specific level
   * @param {Event} event The click event
   * @param {HTMLElement} target The target element
   * @returns {Promise<boolean>}
   * @protected
   */
  async _removeSlotType(event, target) {
    if (this.document.type !== 'class') return false;

    const level = target.dataset.level;
    const slotType = target.dataset.slotType;
    const slotIndex = target.dataset.slotIndex; // For object-based slots

    // Get current level slots
    const levelSlots = foundry.utils.deepClone(
      this.document.system.levelSlots || {}
    );

    if (levelSlots[level]) {
      if (slotIndex !== undefined && slotIndex !== null && slotIndex !== '') {
        // Remove by index for object-based slots (like enhanced schema slots)
        const index = parseInt(slotIndex);
        if (!isNaN(index) && index >= 0 && index < levelSlots[level].length) {
          levelSlots[level].splice(index, 1);
        }
      } else {
        // Remove by type for simple string slots
        levelSlots[level] = levelSlots[level].filter((slot) => {
          // Handle both string slots and object slots
          if (typeof slot === 'string') {
            return slot !== slotType;
          } else if (typeof slot === 'object' && slot.type) {
            return slot.type !== slotType;
          }
          return true;
        });
      }

      // If the array is empty, set it to empty array
      if (levelSlots[level].length === 0) {
        levelSlots[level] = [];
      }
    }

    // Update the document using explicit path for better reliability
    const updateData = { [`system.levelSlots.${level}`]: levelSlots[level] };
    await this.document.update(updateData);
    this.render(true);
    return true;
  }

  /**
   * Handle updating schema slot field inline
   * @param {Event} _event The input event
   * @param {HTMLElement} target The target element
   * @returns {Promise<boolean>}
   * @protected
   */
  async _updateSchemaSlotField(_event, target) {
    if (this.document.type !== 'class') return false;

    const level = target.dataset.level;
    const slotIndex = parseInt(target.dataset.slotIndex);
    const fieldName = target.dataset.field;
    const value = target.value;

    // Get current level slots
    const levelSlots = foundry.utils.deepClone(
      this.document.system.levelSlots || {}
    );

    if (!levelSlots[level] || !levelSlots[level][slotIndex]) {
      return false;
    }

    // Update the specific field
    levelSlots[level][slotIndex][fieldName] = value;

    // Update the document
    await this.document.update({ 'system.levelSlots': levelSlots });

    return true;
  }

  async _updateSchemaSlotAction(_event, target) {
    if (this.document.type !== 'class') return false;

    const level = target.dataset.level;
    const slotIndex = parseInt(target.dataset.slotIndex);
    const fieldName = target.dataset.field;
    const value = target.value;

    // Get current level slots
    const levelSlots = foundry.utils.deepClone(
      this.document.system.levelSlots || {}
    );

    if (!levelSlots[level] || !levelSlots[level][slotIndex]) {
      return false;
    }

    // Clear relevant fields when switching action types
    if (value === 'new' && levelSlots[level][slotIndex].upgradeSlotNumber) {
      delete levelSlots[level][slotIndex].upgradeSlotNumber;
    }
    if (value === 'upgrade' && levelSlots[level][slotIndex].slotNumber) {
      delete levelSlots[level][slotIndex].slotNumber;
    }

    // Update the action field
    levelSlots[level][slotIndex][fieldName] = value;

    // Update the document and trigger re-render to show/hide upgrade dropdown
    await this.document.update({ 'system.levelSlots': levelSlots });
    this.render(false);

    return true;
  }

  async _updateSchemaSlotUpgradeTarget(_event, target) {
    if (this.document.type !== 'class') return false;

    const level = target.dataset.level;
    const slotIndex = parseInt(target.dataset.slotIndex);
    const fieldName = target.dataset.field;
    const value = target.value === '' ? null : parseInt(target.value);

    // Get current level slots
    const levelSlots = foundry.utils.deepClone(
      this.document.system.levelSlots || {}
    );

    if (!levelSlots[level] || !levelSlots[level][slotIndex]) {
      return false;
    }

    // Update the upgrade slot number field
    levelSlots[level][slotIndex][fieldName] = value;

    // Update the document (no re-render needed for upgrade target changes)
    await this.document.update({ 'system.levelSlots': levelSlots });

    return true;
  }

  async _updateSchemaSlotNumber(_event, target) {
    if (this.document.type !== 'class') return false;

    const level = target.dataset.level;
    const slotIndex = parseInt(target.dataset.slotIndex);
    const fieldName = target.dataset.field;
    const value = parseInt(target.value) || null;

    // Get current level slots
    const levelSlots = foundry.utils.deepClone(
      this.document.system.levelSlots || {}
    );

    if (!levelSlots[level] || !levelSlots[level][slotIndex]) {
      return false;
    }

    // Update the slot number field
    levelSlots[level][slotIndex][fieldName] = value;

    // Update the document
    await this.document.update({ 'system.levelSlots': levelSlots });

    return true;
  }
}
