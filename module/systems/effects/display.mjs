/**
 * Prepare the data structure for Active Effects which are currently embedded in an Actor or Item.
 * @param {ActiveEffect[]} effects    A collection or generator of Active Effect documents to prepare sheet data for
 * @return {object}                   Data for rendering
 */
export async function prepareActiveEffectCategories(effects) {
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

  // Iterate over active effects, classifying them into categories
  for (const e of effects) {
    // Enrich the description for display
    if (e.description) {
      e.enrichedDescription =
        await foundry.applications.ux.TextEditor.implementation.enrichHTML(
          e.description,
          {
            secrets: e.parent?.isOwner ?? false,
            async: true,
            relativeTo: e,
          }
        );
    }

    const isStackable = e.flags?.dasu?.stackable;
    const currentStacks = e.flags?.dasu?.currentStacks;

    // Duration display priority:
    // 1. remainingTurns/remainingRounds (dynamic combat tracking)
    // 2. specialDuration (special cases like "removeOnCombatEnd")
    // 3. duration.turns/rounds (static fallback for out-of-combat)
    const remainingTurns = e.flags?.dasu?.remainingTurns;
    const remainingRounds = e.flags?.dasu?.remainingRounds;
    const specialDuration = e.flags?.dasu?.specialDuration;

    if (remainingTurns !== undefined && remainingTurns !== null) {
      // Priority 1: Dynamic per-actor turn tracking (used during combat)
      const turnLabel = remainingTurns === 1 ? 'Turn' : 'Turns';
      e.specialDurationLabel = `${remainingTurns} ${turnLabel}`;
    } else if (remainingRounds !== undefined && remainingRounds !== null) {
      // Priority 1: Dynamic round tracking (used during combat)
      const roundLabel = remainingRounds === 1 ? 'Round' : 'Rounds';
      e.specialDurationLabel = `${remainingRounds} ${roundLabel}`;
    } else if (specialDuration && specialDuration !== 'none') {
      // Priority 2: Special duration handling
      if (specialDuration === 'removeOnCombatEnd') {
        e.specialDurationLabel = game.i18n.localize(
          'DASU.Effect.SpecialDuration.RemoveOnCombatEnd'
        );
      }
    } else if (e.duration?.turns) {
      // Priority 3: Static duration.turns (fallback when not in combat)
      const turnLabel = e.duration.turns === 1 ? 'Turn' : 'Turns';
      e.specialDurationLabel = `${e.duration.turns} ${turnLabel}`;
    } else if (e.duration?.rounds) {
      // Priority 3: Static duration.rounds (fallback when not in combat)
      const roundLabel = e.duration.rounds === 1 ? 'Round' : 'Rounds';
      e.specialDurationLabel = `${e.duration.rounds} ${roundLabel}`;
    }

    // Add stack count for stackable effects (single effect with counter)
    // Show badge when showStackCount is enabled and there's at least 1 stack
    const showStackCount = e.flags?.dasu?.showStackCount;
    if (isStackable && currentStacks && showStackCount) {
      e.stackCount = currentStacks;
    }

    // Categorize the effect
    // Treat suppressed effects the same as disabled
    if (e.disabled || e.isSuppressed) categories.inactive.effects.push(e);
    else if (e.isTemporary) categories.temporary.effects.push(e);
    else categories.passive.effects.push(e);
  }

  // Sort each category
  for (const c of Object.values(categories)) {
    c.effects.sort((a, b) => (a.sort || 0) - (b.sort || 0));
  }
  return categories;
}
