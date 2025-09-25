/**
 * DASU System Settings
 * Centralized configuration for all game system settings
 */
import { GameRulesForm } from '../ui/applications/settings/game-rules.mjs';

export class DASUSettings {
  /**
   * Register all system settings
   */
  static registerSettings() {
    // Register the DASU Settings submenu
    game.settings.registerMenu('dasu', 'dasuSettings', {
      name: 'Game Rules',
      label: 'Configure Game Rules',
      hint: 'Configure game rules including max level, starting AP, and AP per level up.',
      icon: 'fas fa-cog',
      type: GameRulesForm,
      restricted: true,
    });

    // Register individual settings (hidden from main menu, managed by submenu)
    game.settings.register('dasu', 'maxLevel', {
      name: 'Max Level',
      hint: 'Maximum level actors can reach',
      scope: 'world',
      config: false,
      type: Number,
      default: 30,
      range: {
        min: 30,
        max: 60,
        step: 5,
      },
    });

    game.settings.register('dasu', 'startingAP', {
      name: 'Starting AP',
      hint: 'How many AP characters start with at level 1.',
      scope: 'world',
      config: false,
      type: Number,
      default: 0,
      requiresReload: true,
    });

    game.settings.register('dasu', 'apPerLevelUp', {
      name: 'AP per Level Up',
      hint: 'How many AP are gained every 5 levels.',
      scope: 'world',
      config: false,
      type: Number,
      default: 2,
      requiresReload: true,
    });

    game.settings.register('dasu', 'apFormula', {
      name: 'AP Formula',
      hint: 'Formula for calculating AP progression',
      scope: 'world',
      config: false,
      type: String,
      default: 'odd:1-29',
      choices: {
        'odd:1-29': 'Odd levels 1-29 (1 AP per odd level)',
      },
    });

    game.settings.register('dasu', 'spFormula', {
      name: 'SP Formula',
      hint: 'Formula for calculating SP progression',
      scope: 'world',
      config: false,
      type: String,
      default: '2*level',
      choices: {
        '2*level': '2 SP per level',
        level: '1 SP per level',
      },
    });
  }

  /**
   * Get the maximum level setting
   * @returns {number} The maximum level actors can reach
   */
  static getMaxLevel() {
    return game.settings.get('dasu', 'maxLevel');
  }

  /**
   * Set the maximum level setting
   * @param {number} value - The new maximum level value
   */
  static setMaxLevel(value) {
    return game.settings.set('dasu', 'maxLevel', value);
  }
}
