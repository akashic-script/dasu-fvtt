/**
 * Prepare the data structure for Active Effects which are currently embedded in an Actor or Item.
 * @param {ActiveEffect[]} effects    A collection or generator of Active Effect documents to prepare sheet data for
 * @return {object}                   Data for rendering
 */
export function prepareActiveEffectCategories(effects) {
  // Define effect header categories
  const categories = {
    temporary: {
      type: 'temporary',
      label: game.i18n.localize('DASU.Effect.Temporary'),
      effects: [],
    },
    passive: {
      type: 'passive',
      label: game.i18n.localize('DASU.Effect.Passive'),
      effects: [],
    },
    inactive: {
      type: 'inactive',
      label: game.i18n.localize('DASU.Effect.Inactive'),
      effects: [],
    },
  };

  // Group stackable effects by stackId
  const stackGroups = new Map();

  // Iterate over active effects, classifying them into categories
  for (const e of effects) {
    const isStackable = e.flags?.dasu?.stackable;
    const stackId = e.flags?.dasu?.stackId;

    // Check for custom turn tracking and add custom label
    const remainingTurns = e.flags?.dasu?.remainingTurns;
    const remainingRounds = e.flags?.dasu?.remainingRounds;

    if (remainingTurns !== undefined) {
      // Using custom per-actor turn tracking
      const turnLabel = remainingTurns === 1 ? 'Turn' : 'Turns';
      e.specialDurationLabel = `${remainingTurns} ${turnLabel}`;
    } else if (remainingRounds !== undefined) {
      // Using custom round tracking
      const roundLabel = remainingRounds === 1 ? 'Round' : 'Rounds';
      e.specialDurationLabel = `${remainingRounds} ${roundLabel}`;
    } else {
      // Check for special duration and add custom label
      const specialDuration = e.flags?.dasu?.specialDuration;
      if (specialDuration && specialDuration !== 'none') {
        // Create a custom duration display based on special duration type
        if (specialDuration === 'removeOnCombatEnd') {
          // Add a custom property for the special duration label
          e.specialDurationLabel = game.i18n.localize(
            'DASU.Effect.SpecialDuration.RemoveOnCombatEnd'
          );
        }
      }
    }

    if (isStackable && stackId) {
      // Group stackable effects
      if (!stackGroups.has(stackId)) {
        stackGroups.set(stackId, []);
      }
      stackGroups.get(stackId).push(e);
    } else {
      // Non-stackable effects are added normally
      // Treat suppressed effects the same as disabled
      if (e.disabled || e.isSuppressed) categories.inactive.effects.push(e);
      else if (e.isTemporary) categories.temporary.effects.push(e);
      else categories.passive.effects.push(e);
    }
  }

  // Process stackable effect groups
  for (const [stackId, stack] of stackGroups.entries()) {
    if (stack.length === 0) continue;

    // Use the first effect as the representative
    const representative = stack[0];

    // Add stack count to the representative
    representative.stackCount = stack.length;
    representative.stackId = stackId;
    representative.stackEffects = stack;

    // Add to appropriate category
    // Treat suppressed effects the same as disabled
    if (representative.disabled || representative.isSuppressed)
      categories.inactive.effects.push(representative);
    else if (representative.isTemporary)
      categories.temporary.effects.push(representative);
    else categories.passive.effects.push(representative);
  }

  // Sort each category
  for (const c of Object.values(categories)) {
    c.effects.sort((a, b) => (a.sort || 0) - (b.sort || 0));
  }
  return categories;
}
