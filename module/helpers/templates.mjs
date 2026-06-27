/**
 * Define a set of template paths to pre-load
 * Pre-loaded templates are compiled and cached for fast access when rendering
 * @return {Promise}
 */
export const preloadHandlebarsTemplates = async function () {
  return foundry.applications.handlebars.loadTemplates([
    // Actor partials.
    'systems/dasu/templates/actor/parts/actor-items.hbs',
    'systems/dasu/templates/actor/parts/actor-effects.hbs',
    'systems/dasu/templates/actor/parts/aptitudes.hbs',
    'systems/dasu/templates/actor/parts/planner-table.hbs',
    // Item partials
    'systems/dasu/templates/item/parts/item-effects.hbs',
    // Table system
    'systems/dasu/templates/table/dasu-table.hbs',
    'systems/dasu/templates/table/cell/cell-item-name.hbs',
    'systems/dasu/templates/table/cell/cell-item-controls.hbs',
    'systems/dasu/templates/table/cell/cell-effect-controls.hbs',
    'systems/dasu/templates/table/cell/cell-text.hbs',
    'systems/dasu/templates/table/cell/cell-resource.hbs',
    'systems/dasu/templates/table/header/header-item-controls.hbs',
    'systems/dasu/templates/table/header/header-effect-controls.hbs',
    'systems/dasu/templates/table/expand/expand-item-description-with-tags.hbs',
    'systems/dasu/templates/table/expand/expand-schema-description.hbs',
    'systems/dasu/templates/table/expand/expand-stock-daemon.hbs',
    'systems/dasu/templates/table/expand/expand-bond.hbs',
    // Dialogs
    'systems/dasu/templates/dialog/roll-dialog.hbs',
    'systems/dasu/templates/dialog/schema-dialog.hbs',
    'systems/dasu/templates/dialog/bond-dialog.hbs',
    // Pipeline chat
    'systems/dasu/templates/chat/pipeline/pipeline-result.hbs',
    'systems/dasu/templates/chat/pipeline/body-stub.hbs',
    // Check chat partials
    'systems/dasu/templates/chat/chat-check.hbs',
    'systems/dasu/templates/chat/chat-resistance.hbs',
    'systems/dasu/templates/chat/partials/chat-check-roll.hbs',
    'systems/dasu/templates/chat/partials/chat-check-targets.hbs',
    'systems/dasu/templates/chat/partials/chat-check-outcome.hbs',
    'systems/dasu/templates/chat/partials/chat-check-description.hbs',
  ]);
};
