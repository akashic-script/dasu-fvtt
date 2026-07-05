import { SYSTEM } from './config.mjs';

/** System settings for combat. Registered once at init. */
export function registerCombatSettings() {
  game.settings.register(SYSTEM, 'autoRollInitiative', {
    name: 'DASU.Settings.AutoRollInitiative.Name',
    hint: 'DASU.Settings.AutoRollInitiative.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  });
}
