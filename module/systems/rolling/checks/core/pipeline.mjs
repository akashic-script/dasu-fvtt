/**
 * Core Checks Pipeline Implementation
 *
 * Implements the three-phase check system architecture:
 * 1. Prepare: Initialize check data and collect modifiers
 * 2. Process: Execute dice rolls and calculate results
 * 3. Render: Generate chat messages with appropriate templates
 *
 * @example
 * const pipeline = new ChecksPipeline();
 * const result = await pipeline.attributeCheck(actor, ['pow', 'dex'], config);
 */

import { CheckHooks } from './hooks.mjs';
import { validateCheck, validateCheckResult } from './validation.mjs';
import { PreparePhase } from '../phases/prepare.mjs';
import { ProcessPhase } from '../phases/process.mjs';
import { RenderPhase } from '../phases/render.mjs';

/**
 * Main pipeline class that orchestrates the three-phase check system
 */
export class ChecksPipeline {
  /**
   * Initialize the pipeline with hooks system
   */
  constructor() {
    this.hooks = new CheckHooks();
  }

  /**
   * Execute an attribute check using the dice pool system
   * @param {Actor} actor - The actor making the check
   * @param {string[]} attributes - Array of attribute keys (e.g., ['pow', 'dex'])
   * @param {Function|Object} [config] - Optional configuration function or object
   * @returns {Promise<ChatMessage>} The created chat message
   */
  async attributeCheck(actor, attributes, config) {
    const check = await this.prepareCheck(
      'attribute',
      { actor, attributes },
      config
    );
    const result = await this.processCheck(check, actor);
    return await this.renderCheck(result, actor);
  }

  /**
   * Execute a skill check using the dice pool system
   * @param {Actor} actor - The actor making the check
   * @param {string[]} attributes - Array of attribute keys
   * @param {Object} skill - The skill object being used
   * @param {Function|Object} [config] - Optional configuration function or object
   * @returns {Promise<ChatMessage>} The created chat message
   */
  async skillCheck(actor, attributes, skill, config) {
    const check = await this.prepareCheck(
      'skill',
      { actor, attributes, skill },
      config
    );
    const result = await this.processCheck(check, actor, skill);
    return await this.renderCheck(result, actor, skill);
  }

  /**
   * Execute an accuracy check using the 2d6 system
   * @param {Actor} actor - The actor making the check
   * @param {Item} item - The weapon/item being used
   * @param {Function|Object} [config] - Optional configuration function or object
   * @returns {Promise<ChatMessage>} The created chat message
   */
  async accuracyCheck(actor, item, config) {
    const check = await this.prepareCheck('accuracy', { actor, item }, config);
    const result = await this.processCheck(check, actor, item);
    return await this.renderCheck(result, actor, item);
  }

  /**
   * Execute an initiative check using the 2d6 system
   * @param {Actor} actor - The actor making the check
   * @param {string} attribute - The attribute key being used
   * @param {Function|Object} [config] - Optional configuration function or object
   * @returns {Promise<ChatMessage>} The created chat message
   */
  async initiativeCheck(actor, attribute, config) {
    const check = await this.prepareCheck(
      'initiative',
      { actor, attribute },
      config
    );
    const result = await this.processCheck(check, actor);
    return await this.renderCheck(result, actor);
  }

  /**
   * Execute a display check for items that don't require rolling
   * @param {Actor} actor - The actor displaying the item
   * @param {Item} item - The item being displayed
   * @param {Function|Object} [config] - Optional configuration function or object
   * @returns {Promise<ChatMessage>} The created chat message
   */
  async displayCheck(actor, item, config) {
    const check = await this.prepareCheck('display', { actor, item }, config);
    const result = await this.processCheck(check, actor, item);
    return await this.renderCheck(result, actor, item);
  }

  /**
   * Phase 1: Preparation - Initialize check data and collect modifiers
   * @param {string} type - The check type (attribute, skill, accuracy, initiative, display)
   * @param {Object} data - The check data containing actor, item, attributes, etc.
   * @param {Function|Object} [config] - Optional configuration function or object
   * @returns {Promise<Object>} The prepared check object
   * @private
   */
  async prepareCheck(type, data, config) {
    const check = await PreparePhase.prepare(type, data, config);
    validateCheck(check);

    // Execute prepare hooks
    const registerCallback = (callback, priority) => {
      this.hooks.registerPrepareCallback(check.id, callback, priority);
    };

    Hooks.call(
      'dasu.prepareCheck',
      check,
      data.actor,
      data.item,
      registerCallback
    );
    await this.hooks.executePrepareCallbacks(check, data.actor, data.item);

    return check;
  }

  /**
   * Phase 2: Processing - Execute dice rolls and calculate results
   * @param {Object} check - The prepared check object
   * @param {Actor} actor - The actor making the check
   * @param {Item} [item] - Optional item being used
   * @returns {Promise<Object>} The processed check result
   * @private
   */
  async processCheck(check, actor, item) {
    const result = await ProcessPhase.process(check, actor, item);
    validateCheckResult(result);

    // Execute process hooks
    Hooks.call('dasu.processCheck', result, actor, item);

    return result;
  }

  /**
   * Phase 3: Rendering - Generate chat messages with appropriate templates
   * @param {Object} result - The processed check result
   * @param {Actor} actor - The actor making the check
   * @param {Item} [item] - Optional item being used
   * @returns {Promise<ChatMessage>} The created chat message
   * @private
   */
  async renderCheck(result, actor, item) {
    const sections = [];
    const additionalFlags = {};

    // Execute render hooks to collect content
    Hooks.call(
      'dasu.renderCheck',
      sections,
      result,
      actor,
      item,
      additionalFlags
    );

    return await RenderPhase.render(
      sections,
      result,
      actor,
      item,
      additionalFlags
    );
  }
}
