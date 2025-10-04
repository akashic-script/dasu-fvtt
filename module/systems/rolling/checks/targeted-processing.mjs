/**
 * Targeted Processing Implementation
 * Adds targeted individuals from Foundry VTT's targeting system to accuracy checks
 */

import { CheckTypes } from './core/types.mjs';

/**
 * Add targeted individuals from Foundry VTT's targeting system to accuracy checks
 */
const onProcessCheck = (result, actor, item) => {
  if (result.type !== CheckTypes.ACCURACY) return;

  const targetedTokens = Array.from(game.user.targets);
  if (targetedTokens.length === 0) return;

  const rollTotal = result.roll?.total || 0;
  const isCritical = result.critical || rollTotal === 12;
  const isFumble = rollTotal <= 2;
  const isAutoSuccess = result.autoSuccess || item?.system?.isInfinity;

  const targetedIndividuals = targetedTokens
    .map((token) => {
      if (!token.actor) return null;

      const targetResult = calculateTargetResult(
        rollTotal,
        token.actor,
        isCritical,
        isFumble,
        isAutoSuccess
      );
      return {
        name: token.actor.name,
        result: targetResult,
        actorId: token.actor.id,
        tokenId: token.id,
      };
    })
    .filter((target) => target !== null);

  if (targetedIndividuals.length > 0) {
    result.targetedIndividuals = targetedIndividuals;
  }
};

/**
 * Calculate hit/miss result for a target
 */
function calculateTargetResult(
  rollTotal,
  targetActor,
  isCritical,
  isFumble,
  isAutoSuccess
) {
  // Auto-success items always hit, but still check for critical separately
  if (isAutoSuccess) {
    return isCritical ? 'crit' : 'hit';
  }

  if (isFumble) return 'fumble';
  if (isCritical) return 'crit';

  const targetAvoid = targetActor.system?.stats?.avoid?.value || 10;
  return rollTotal >= targetAvoid ? 'hit' : 'miss';
}

/**
 * Initialize the targeted processing system
 */
const initialize = () => Hooks.on('dasu.processCheck', onProcessCheck);

export const TargetedProcessing = Object.freeze({ initialize });
