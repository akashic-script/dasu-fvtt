import { SYSTEM } from '../helpers/config.mjs';

/**
 * The three lifecycle hooks of the check pipeline. Listeners register against
 * these to extend checks without touching the engine.
 *
 * - prepareCheck: mutate the (sealed) check before rolling (modifiers, TN, ...)
 * - processCheck: react to the (frozen) result after rolling (success, crit...)
 * - renderCheck:  contribute chat sections / tags for the result message
 */
export const CheckHooks = Object.freeze({
  prepareCheck: `${SYSTEM}.prepareCheck`,
  processCheck: `${SYSTEM}.processCheck`,
  renderCheck: `${SYSTEM}.renderCheck`,
});

/**
 * @typedef {string} CheckId
 */

/**
 * @typedef {'attribute'|'skill'|'accuracy'|'tactic'|'initiative'|'open'|'opposed'|'group'|'display'} CheckType
 */

/**
 * @typedef {'pow'|'dex'|'wil'|'sta'} Attribute
 */

/**
 * @typedef CheckModifier
 * @property {string} label localization key or text for this modifier
 * @property {number} value the signed value of this modifier
 * @property {string} [source] named source used for stacking rules (one bonus
 *   per named source; see DASU modifier stacking)
 */

/**
 * A mutable check configuration. Sealed during {@link prepareCheck}: listeners
 * may change existing fields and write into `additionalData`, but cannot add
 * new top-level keys.
 *
 * @typedef Check
 * @property {CheckType} type
 * @property {CheckId} id
 * @property {Attribute} [primary] governing attribute (or first die source)
 * @property {Attribute} [secondary] second attribute, when a check rolls a pair
 * @property {string} [skill] skill key, for skill checks
 * @property {CheckModifier[]} modifiers flat modifiers added to the tick
 * @property {number} tick the additive "Tick" before modifiers
 * @property {number} critThreshold per-die crit threshold (DASU default 11)
 * @property {number} dice number of dice rolled (DASU base 2)
 * @property {number} faces die size (DASU d10)
 * @property {boolean} [advantage] roll one extra die, drop the lowest
 * @property {boolean} [disadvantage] roll one extra die, drop the highest
 * @property {Object} additionalData freeform extension bag (see CheckConfiguration)
 */

/**
 * The frozen outcome of a rolled check.
 *
 * @typedef CheckResult
 * @property {CheckType} type
 * @property {CheckId} id
 * @property {string} actorUuid
 * @property {string} [itemUuid]
 * @property {string} [itemName]
 * @property {Object} roll serialized Roll
 * @property {Object[]} additionalRolls
 * @property {number[]} dice the kept die faces (length === check.dice)
 * @property {number} tick
 * @property {CheckModifier[]} modifiers
 * @property {number} modifierTotal sum of all modifier values
 * @property {number} critThreshold
 * @property {number} result total of kept dice + tick + modifierTotal
 * @property {boolean} critical doubles where both dice meet critThreshold
 * @property {boolean} snakeEyes both kept dice show 1
 * @property {Object} additionalData
 */

/**
 * @callback CheckCallback
 * @param {Check} check
 * @param {FUActor} actor
 * @param {FUItem} [item]
 * @return {Promise | void}
 */

/**
 * @callback CheckResultCallback
 * @param {CheckResult} result
 * @return {Promise | void}
 */

/**
 * @callback CheckCallbackRegistration
 * @param {CheckCallback} callback
 * @param {number} [priority=0]
 * @return void
 */

/**
 * @callback PrepareCheckHook
 * @param {Check} check
 * @param {FUActor} actor
 * @param {FUItem} [item]
 * @param {CheckCallbackRegistration} registerCallback
 */

/**
 * @callback ProcessCheckHook
 * @param {CheckResult} check
 * @param {FUActor} actor
 * @param {FUItem} [item]
 * @param {CheckCallbackRegistration} registerCallback
 */

/**
 * @typedef CheckSection
 * @property {string} [content] HTML to insert; takes precedence over `partial`
 * @property {string} [partial] partial path to render
 * @property {Object} [data] data passed to the partial
 * @property {number} [order] sections render from lowest to highest order
 */

/**
 * @typedef {(CheckSection | Promise<CheckSection> | (() => CheckSection) | (() => Promise<CheckSection>))[]} CheckSectionRenderData
 */

/**
 * @typedef DASURenderData
 * @property {CheckSectionRenderData} sections
 * @property {Promise[]} postRenderActions
 * @property {{tag: string, value?: string}[]} tags
 */

/**
 * @callback RenderCheckHook
 * @param {DASURenderData} data
 * @param {CheckResult} check
 * @param {FUActor} actor
 * @param {FUItem} [item]
 * @param {Object} additionalFlags
 */
