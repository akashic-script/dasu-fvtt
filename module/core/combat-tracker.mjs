/**
 * Initialize combat tracker enhancements
 * Adds disposition data attributes to combatant elements for styling
 */
export function initializeCombatTracker() {
  Hooks.on('renderCombatTracker', (_app, html, _data) => {
    const root = html instanceof HTMLElement ? html : html[0];
    const combatants = root.querySelectorAll('li.combatant');

    combatants.forEach((li) => {
      const combatantId = li.dataset.combatantId;
      if (!combatantId) return;

      const combatant = game.combat?.combatants.get(combatantId);
      if (!combatant) return;

      // FRIENDLY = 1 (ally/PC), NEUTRAL = 0, HOSTILE = -1 (enemy)
      li.dataset.disposition = combatant.token?.disposition ?? 0;
    });
  });
}
