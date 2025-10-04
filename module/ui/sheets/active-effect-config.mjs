/**
 * @fileoverview DASU Active Effect Configuration Sheet
 * Custom configuration sheet for Active Effects with stackable support
 */
/* global fromUuidSync */

/**
 * Custom Active Effect configuration sheet for DASU system
 * @extends {foundry.applications.sheets.ActiveEffectConfig}
 */
export class DASUActiveEffectConfig extends foundry.applications.sheets
  .ActiveEffectConfig {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ['dasu', 'active-effect-config'],
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Add DASU-specific context
    context.dasuFlags = this.document.flags.dasu || {};
    context.isStackable = context.dasuFlags.stackable || false;

    // Add stack mode options
    context.stackModeOptions = {
      ADD: 'DASU.Effect.StackMode.Add',
      MULTIPLY: 'DASU.Effect.StackMode.Multiply',
      MAX: 'DASU.Effect.StackMode.Max',
      MIN: 'DASU.Effect.StackMode.Min',
    };

    // Calculate current stack count if stackable
    if (context.isStackable && context.dasuFlags.stackId) {
      const actor = this.document.parent;
      if (actor?.getEffectStackCount) {
        context.currentStackCount = actor.getEffectStackCount(
          context.dasuFlags.stackId
        );
      }
    }

    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    console.log('DASU | ActiveEffect config rendered for:', this.document);
    console.log('DASU | Effect duration:', this.document.duration);

    // Inject stackable fields into the details tab
    this._injectStackableFields();

    // Inject special duration field into the duration tab
    this._injectSpecialDurationField();
  }

  /**
   * Inject stackable effect fields into the details tab
   * @private
   */
  _injectStackableFields() {
    const detailsSection = this.element.querySelector(
      'section[data-application-part="details"]'
    );
    if (!detailsSection) return;

    // Get flags from the effect document
    let dasuFlags = this.document.flags.dasu || {};

    // If effect has a status, check if that status has predefined stackable flags
    const statuses = Array.from(this.document.statuses || []);
    if (statuses.length > 0 && !dasuFlags.stackable) {
      const statusId = statuses[0];
      const statusCondition = CONFIG.DASU_STATUS_CONDITIONS?.[statusId];
      if (statusCondition?.flags?.dasu) {
        // Use predefined flags from status condition
        dasuFlags = foundry.utils.mergeObject(
          dasuFlags,
          statusCondition.flags.dasu
        );
      }
    }

    const isStackable = dasuFlags.stackable || false;

    // Get source actor name from origin
    let sourceActorName = '';
    if (this.document.origin) {
      try {
        const originDoc = fromUuidSync(this.document.origin);
        if (originDoc) {
          // If origin is an actor
          if (originDoc.documentName === 'Actor') {
            sourceActorName = originDoc.name;
          }
          // If origin is an item, get the parent actor
          else if (originDoc.parent?.documentName === 'Actor') {
            sourceActorName = originDoc.parent.name;
          }
          // If origin is a token, get the actor
          else if (originDoc.actor) {
            sourceActorName = originDoc.actor.name;
          }
        }
      } catch (error) {
        console.warn('Could not resolve effect origin:', error);
      }
    }

    // Inject source actor name after origin field
    const originGroup = detailsSection
      .querySelector('input[name="origin"]')
      ?.closest('.form-group');
    if (originGroup && sourceActorName) {
      const sourceActorHTML = `
        <div class="form-group dasu-effect-source">
          <label>${game.i18n.localize('DASU.Effect.SourceActor')}</label>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <input type="text" value="${sourceActorName}" disabled style="flex: 1;" />
            <button type="button" class="dasu-open-source-actor" data-origin="${
              this.document.origin
            }" style="flex: 0 0 auto; padding: 0.25rem 0.5rem;" data-tooltip="${game.i18n.localize(
        'DASU.Effect.OpenSourceActor'
      )}">
              <i class="fas fa-edit"></i>
            </button>
          </div>
        </div>
      `;
      originGroup.insertAdjacentHTML('afterend', sourceActorHTML);

      // Add click handler for the button
      const openButton = detailsSection.querySelector(
        '.dasu-open-source-actor'
      );
      if (openButton) {
        openButton.addEventListener('click', async (event) => {
          event.preventDefault();
          const origin = openButton.dataset.origin;
          if (!origin) return;

          try {
            const originDoc = await fromUuid(origin);
            let actorToOpen = null;

            if (originDoc) {
              // If origin is an actor
              if (originDoc.documentName === 'Actor') {
                actorToOpen = originDoc;
              }
              // If origin is an item, get the parent actor
              else if (originDoc.parent?.documentName === 'Actor') {
                actorToOpen = originDoc.parent;
              }
              // If origin is a token, get the actor
              else if (originDoc.actor) {
                actorToOpen = originDoc.actor;
              }
            }

            if (actorToOpen) {
              // Check if user has permission to view
              if (actorToOpen.testUserPermission(game.user, 'OBSERVER')) {
                actorToOpen.sheet.render(true);
              } else {
                ui.notifications.warn(
                  game.i18n.localize('DASU.Effect.NoPermissionToView')
                );
              }
            }
          } catch (error) {
            console.error('Error opening source actor:', error);
            ui.notifications.error(
              game.i18n.localize('DASU.Effect.CannotOpenSourceActor')
            );
          }
        });
      }
    }

    // Create HTML for stackable fields
    const stackableHTML = `
      <hr>
      <div class="form-group dasu-stackable">
        <label class="checkbox">
          <input type="checkbox" name="flags.dasu.stackable" ${
            isStackable ? 'checked' : ''
          } />
          ${game.i18n.localize('DASU.Effect.Stackable')}
        </label>
        <p class="hint">${game.i18n.localize('DASU.Effect.StackableHint')}</p>
      </div>

      <div class="stack-options" style="display: ${
        isStackable ? 'block' : 'none'
      };">
        <div class="form-group">
          <label for="flags.dasu.stackId">${game.i18n.localize(
            'DASU.Effect.StackId'
          )}</label>
          <input type="text" name="flags.dasu.stackId" value="${
            dasuFlags.stackId || ''
          }" placeholder="unique-stack-id" />
          <p class="hint">${game.i18n.localize('DASU.Effect.StackIdHint')}</p>
        </div>

        <div class="form-group">
          <label for="flags.dasu.maxStacks">${game.i18n.localize(
            'DASU.Effect.MaxStacks'
          )}</label>
          <input type="number" name="flags.dasu.maxStacks" value="${
            dasuFlags.maxStacks || ''
          }" min="1" placeholder="Unlimited" />
          <p class="hint">${game.i18n.localize('DASU.Effect.MaxStacksHint')}</p>
        </div>

        <div class="form-group">
          <label for="flags.dasu.stackMode">${game.i18n.localize(
            'DASU.Effect.StackModeLabel'
          )}</label>
          <select name="flags.dasu.stackMode">
            <option value="ADD" ${
              dasuFlags.stackMode === 'ADD' ? 'selected' : ''
            }>${game.i18n.localize('DASU.Effect.StackMode.Add')}</option>
            <option value="MULTIPLY" ${
              dasuFlags.stackMode === 'MULTIPLY' ? 'selected' : ''
            }>${game.i18n.localize('DASU.Effect.StackMode.Multiply')}</option>
            <option value="MAX" ${
              dasuFlags.stackMode === 'MAX' ? 'selected' : ''
            }>${game.i18n.localize('DASU.Effect.StackMode.Max')}</option>
            <option value="MIN" ${
              dasuFlags.stackMode === 'MIN' ? 'selected' : ''
            }>${game.i18n.localize('DASU.Effect.StackMode.Min')}</option>
          </select>
          <p class="hint">${game.i18n.localize('DASU.Effect.StackModeHint')}</p>
        </div>

        <div class="form-group">
          <label class="checkbox">
            <input type="checkbox" name="flags.dasu.showStackCount" ${
              dasuFlags.showStackCount ? 'checked' : ''
            } />
            ${game.i18n.localize('DASU.Effect.ShowStackCount')}
          </label>
          <p class="hint">${game.i18n.localize(
            'DASU.Effect.ShowStackCountHint'
          )}</p>
        </div>

        ${
          this.document.parent?.getEffectStackCount?.(dasuFlags.stackId)
            ? `
          <div class="form-group">
            <label>${game.i18n.localize('DASU.Effect.CurrentStacks')}</label>
            <input type="number" value="${this.document.parent.getEffectStackCount(
              dasuFlags.stackId
            )}" disabled />
            <p class="hint">${game.i18n.localize(
              'DASU.Effect.CurrentStacksHint'
            )}</p>
          </div>
        `
            : ''
        }
      </div>
    `;

    // Append to details section
    detailsSection.insertAdjacentHTML('beforeend', stackableHTML);

    // Add event listener for stackable checkbox
    const stackableCheckbox = detailsSection.querySelector(
      'input[name="flags.dasu.stackable"]'
    );
    const stackOptions = detailsSection.querySelector('.stack-options');

    if (stackableCheckbox && stackOptions) {
      stackableCheckbox.addEventListener('change', (event) => {
        stackOptions.style.display = event.target.checked ? 'block' : 'none';
      });
    }
  }

  /**
   * Inject special duration field into the duration tab
   * @private
   */
  _injectSpecialDurationField() {
    const durationSection = this.element.querySelector(
      'section[data-application-part="duration"]'
    );
    if (!durationSection) return;

    // Get flags from the effect document
    let dasuFlags = this.document.flags.dasu || {};

    // If effect has a status, check if that status has predefined special duration and duration values
    const statuses = Array.from(this.document.statuses || []);
    if (statuses.length > 0) {
      const statusId = statuses[0];
      const statusCondition = CONFIG.DASU_STATUS_CONDITIONS?.[statusId];

      if (statusCondition) {
        // Merge special duration flags
        if (
          statusCondition.flags?.dasu?.specialDuration &&
          !dasuFlags.specialDuration
        ) {
          dasuFlags = foundry.utils.mergeObject(
            dasuFlags,
            statusCondition.flags.dasu
          );
        }

        // Pre-fill duration fields from status condition if the effect is new
        if (statusCondition.duration && !this.document.id) {
          const turnsInput = durationSection.querySelector(
            'input[name="duration.turns"]'
          );
          const roundsInput = durationSection.querySelector(
            'input[name="duration.rounds"]'
          );
          const secondsInput = durationSection.querySelector(
            'input[name="duration.seconds"]'
          );

          if (turnsInput && statusCondition.duration.turns !== undefined) {
            turnsInput.value = statusCondition.duration.turns;
          }
          if (roundsInput && statusCondition.duration.rounds !== undefined) {
            roundsInput.value = statusCondition.duration.rounds;
          }
          if (secondsInput && statusCondition.duration.seconds !== undefined) {
            secondsInput.value = statusCondition.duration.seconds;
          }
        }
      }
    }

    const specialDuration = dasuFlags.specialDuration || 'none';
    const remainingTurns = dasuFlags.remainingTurns;
    const remainingRounds = dasuFlags.remainingRounds;

    // Fix blank duration.rounds and duration.turns fields for existing effects
    // If custom tracking is active but duration fields are null/blank, restore them
    const turnsInput = durationSection.querySelector(
      'input[name="duration.turns"]'
    );
    const roundsInput = durationSection.querySelector(
      'input[name="duration.rounds"]'
    );

    if (
      remainingTurns !== undefined &&
      turnsInput &&
      (!turnsInput.value || turnsInput.value === '0')
    ) {
      // Restore turns value from remaining turns if it's blank
      turnsInput.value = remainingTurns;
      turnsInput.setAttribute('data-restored', 'true');
    }

    if (
      remainingRounds !== undefined &&
      roundsInput &&
      (!roundsInput.value || roundsInput.value === '0')
    ) {
      // Restore rounds value from remaining rounds if it's blank
      roundsInput.value = remainingRounds;
      roundsInput.setAttribute('data-restored', 'true');
    }

    // Create HTML for remaining turns/rounds indicators
    // Show these fields only if custom tracking is active (values are set)
    const showRemainingFields =
      remainingTurns !== undefined || remainingRounds !== undefined;

    let remainingDurationHTML = '';

    if (showRemainingFields) {
      remainingDurationHTML += `
        <fieldset style="border: 2px solid var(--color-border-highlight); background: rgba(74, 144, 226, 0.05); padding: 0.75rem; margin-bottom: 1rem;">
          <legend style="font-weight: bold; color: var(--color-text-dark-primary); padding: 0 0.5rem;">Active Duration Tracking</legend>
          <p style="margin: 0 0 0.75rem 0; font-style: italic; color: var(--color-text-light-secondary);">
            <i class="fas fa-info-circle"></i> These fields show the current remaining duration. Set initial duration in the fields above.
          </p>
      `;

      // Show remaining rounds field if set
      if (remainingRounds !== undefined) {
        remainingDurationHTML += `
          <div class="form-group" style="margin-bottom: 0.75rem;">
            <label>Remaining Rounds (Read-only)</label>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <input type="number" value="${remainingRounds}" min="0" disabled style="flex: 0 0 80px; opacity: 0.7;" />
              <p style="margin: 0; font-size: 0.9em; color: var(--color-text-light-secondary);">Decrements each combat round for all combatants</p>
            </div>
          </div>
        `;
      }

      // Show remaining turns field if set
      if (remainingTurns !== undefined) {
        remainingDurationHTML += `
          <div class="form-group" style="margin-bottom: 0;">
            <label>Remaining Actor Turns (Read-only)</label>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <input type="number" value="${remainingTurns}" min="0" disabled style="flex: 0 0 80px; opacity: 0.7;" />
              <p style="margin: 0; font-size: 0.9em; color: var(--color-text-light-secondary);">Decrements only on this actor's turn</p>
            </div>
          </div>
        `;
      }

      remainingDurationHTML += `
        </fieldset>
      `;
    }

    // Create HTML for special duration field
    const specialDurationHTML = `
      ${remainingDurationHTML}
      <fieldset>
        <div class="form-group dasu-special-duration">
          <label for="flags.dasu.specialDuration">${game.i18n.localize(
            'DASU.Effect.SpecialDurationLabel'
          )}</label>
          <div class="form-fields">
            <select name="flags.dasu.specialDuration" id="flags.dasu.specialDuration">
              <option value="none" ${
                specialDuration === 'none' ? 'selected' : ''
              }>${game.i18n.localize(
      'DASU.Effect.SpecialDuration.None'
    )}</option>
              <option value="removeOnCombatEnd" ${
                specialDuration === 'removeOnCombatEnd' ? 'selected' : ''
              }>${game.i18n.localize(
      'DASU.Effect.SpecialDuration.RemoveOnCombatEnd'
    )}</option>
            </select>
          </div>
          <p class="hint">${game.i18n.localize(
            'DASU.Effect.SpecialDurationHint'
          )}</p>
        </div>
      </fieldset>
    `;

    // Append to duration section
    durationSection.insertAdjacentHTML('beforeend', specialDurationHTML);
  }
}
