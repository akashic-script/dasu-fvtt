/**
 * @fileoverview Token HUD Effects Extension
 * Extends the token HUD to support stackable effects with custom duration tracking
 */

import { EffectProcessor } from './processor.mjs';

/**
 * Initialize token HUD effect handlers
 */
export function initializeTokenHudEffects() {
  Hooks.on('renderTokenHUD', _onRenderTokenHUD);
}

/**
 * Handle Token HUD rendering to add custom effect support
 * @param {TokenHUD} hud - The Token HUD
 * @param {HTMLElement} html - The rendered HTML
 * @param {Object} data - The render data
 * @private
 */
function _onRenderTokenHUD(hud, html, data) {
  const effectsPalette = html.querySelector('.status-effects');
  if (!effectsPalette) return;

  const effectControls = effectsPalette.querySelectorAll('.effect-control');

  effectControls.forEach((element) => {
    const statusId = element.dataset.statusId;
    if (!statusId) return;

    const statusCondition = CONFIG.DASU_STATUS_CONDITIONS?.[statusId];
    const isStackable = statusCondition?.flags?.dasu?.stackable;

    if (isStackable) {
      _setupStackableEffect(element, hud, statusId, statusCondition);
    } else {
      _setupNonStackableEffect(element, hud, statusId);
    }
  });
}

/**
 * Setup handlers for stackable effects
 * @private
 */
function _setupStackableEffect(element, hud, statusId, statusCondition) {
  element.classList.add('stackable-effect');

  // Add stack count badge
  const actor = hud.object?.actor;
  if (actor) {
    const stackId = statusCondition.flags.dasu.stackId;
    const stackCount = actor.getEffectStackCount?.(stackId) || 0;

    if (stackCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'stack-count-badge';
      badge.textContent = stackCount;
      element.appendChild(badge);
    }
  }

  _attachEventHandlers(element, hud, statusId, {
    onClick: (ctrl) =>
      ctrl
        ? _onEffectOpenDialog(hud, statusId)
        : _onStackableEffectClick(hud, statusId, false),
    onRightClick: () => _onStackableEffectClick(hud, statusId, true),
  });
}

/**
 * Setup handlers for non-stackable effects
 * @private
 */
function _setupNonStackableEffect(element, hud, statusId) {
  _attachEventHandlers(element, hud, statusId, {
    onClick: (ctrl) =>
      ctrl
        ? _onEffectOpenDialog(hud, statusId)
        : _onNonStackableEffectClick(hud, statusId),
    onRightClick: () => _onNonStackableEffectRemove(hud, statusId),
  });
}

/**
 * Attach event handlers to effect element
 * @private
 */
function _attachEventHandlers(element, hud, statusId, handlers) {
  element.removeAttribute('data-action');

  const newElement = element.cloneNode(true);
  element.parentNode.replaceChild(newElement, element);

  newElement.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    handlers.onClick(event.ctrlKey || event.metaKey);
    return false;
  });

  if (handlers.onRightClick) {
    newElement.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      handlers.onRightClick();
      return false;
    });
  }
}

/**
 * Open the status effect dialog
 * @private
 */
async function _onEffectOpenDialog(hud, statusId) {
  const actor = hud.object?.actor;
  if (!actor) return;

  const statusCondition = CONFIG.DASU_STATUS_CONDITIONS?.[statusId];
  if (!statusCondition) return;

  const { StatusEffectDialog } = await import(
    '../ui/dialogs/status-effect-dialog.mjs'
  );
  await StatusEffectDialog.show({ actor, statusId, statusCondition });
  hud.render();
}

/**
 * Handle stackable effect clicks
 * @private
 */
async function _onStackableEffectClick(hud, statusId, isRightClick) {
  const actor = hud.object?.actor;
  if (!actor) return;

  const statusCondition = CONFIG.DASU_STATUS_CONDITIONS?.[statusId];
  if (!statusCondition?.flags?.dasu?.stackable) return;

  const stackId = statusCondition.flags.dasu.stackId;

  if (isRightClick) {
    await actor.removeEffectStack(stackId);
  } else {
    const effectData = _buildEffectData(statusCondition, statusId);
    // Use the centralized effect processor
    await EffectProcessor.applyEffect(actor, effectData, { toggle: false });
  }

  hud.render();
}

/**
 * Handle non-stackable effect toggle
 * @private
 */
async function _onNonStackableEffectClick(hud, statusId) {
  const actor = hud.object?.actor;
  if (!actor) return;

  const statusCondition = CONFIG.DASU_STATUS_CONDITIONS?.[statusId];
  if (!statusCondition) return;

  const effectData = _buildEffectData(statusCondition, statusId);
  // Use the centralized effect processor with toggle enabled
  await EffectProcessor.applyEffect(actor, effectData, { toggle: true });

  hud.render();
}

/**
 * Handle non-stackable effect removal
 * @private
 */
async function _onNonStackableEffectRemove(hud, statusId) {
  const actor = hud.object?.actor;
  if (!actor) return;

  const existingEffect = actor.effects.find((e) => e.statuses.has(statusId));
  if (existingEffect) {
    await existingEffect.delete();
  }

  hud.render();
}

/**
 * Build effect data from status condition
 * @private
 */
function _buildEffectData(statusCondition, statusId) {
  const effectData = {
    name: game.i18n.localize(statusCondition.name),
    icon: statusCondition.img,
    statuses: [statusId],
    duration: foundry.utils.deepClone(statusCondition.duration || {}),
    flags: foundry.utils.deepClone(statusCondition.flags || {}),
  };

  if (statusCondition.tint) {
    effectData.tint = statusCondition.tint;
  }

  if (statusCondition.description) {
    effectData.description = statusCondition.description; // Processor will localize
  }

  if (statusCondition.changes) {
    effectData.changes = foundry.utils.deepClone(statusCondition.changes);
  }

  // Duration conversion is now handled by EffectProcessor
  return effectData;
}
