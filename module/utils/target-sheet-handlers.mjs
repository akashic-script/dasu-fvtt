/**
 * @fileoverview Target Sheet Handlers
 * Utility functions for handling clickable target names in chat messages
 */

/**
 * Initialize event handlers for clickable target names
 * This should be called during system initialization
 */
export function initializeTargetSheetHandlers() {
  // Add global event delegation for clickable target names
  document.addEventListener('click', handleTargetNameClick);
  console.log('DASU | Target sheet handlers initialized');
}

/**
 * Handle clicks on target names to open character sheets
 * @param {Event} event - The click event
 */
function handleTargetNameClick(event) {
  // Check if the clicked element is a clickable target name
  const targetName = event.target.closest(
    '.target-name.clickable[data-actor-id]'
  );
  if (!targetName) return;

  event.preventDefault();
  event.stopPropagation();

  const actorId = targetName.dataset.actorId;
  const tokenId = targetName.dataset.tokenId;

  if (!actorId) return;

  let actor;

  // For unlinked tokens, we need to get the token first to access its actor
  if (tokenId) {
    const token = game.canvas?.tokens?.get(tokenId);
    if (token) {
      actor = token.actor;
    } else {
      // Token not found on current scene, try to find it in other scenes
      for (const scene of game.scenes) {
        const sceneToken = scene.tokens.get(tokenId);
        if (sceneToken) {
          actor = sceneToken.actor;
          break;
        }
      }
    }
  }

  // Fallback to linked actor lookup
  if (!actor) {
    actor = game.actors.get(actorId);
  }

  if (!actor) {
    ui.notifications.warn(`Actor not found: ${actorId}`);
    return;
  }

  // Open the character sheet
  actor.sheet.render(true);
}
