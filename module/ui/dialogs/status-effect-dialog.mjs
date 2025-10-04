/**
 * @fileoverview Status Effect Application Dialog
 * Dialog for applying status effects with custom duration and source actor
 */

/* global */

/**
 * Dialog for applying a status effect with custom options
 */
export class StatusEffectDialog {
  static async show(options = {}) {
    const {
      statusId,
      statusCondition,
      actor,
      targets: providedTargets,
      sourceActor: providedSource,
    } = options;
    let sourceActor = null;
    let targetActors = [];

    // Set source actor from options
    if (providedSource) {
      sourceActor = providedSource;
    }

    // Populate targets from current game targets or provided targets
    if (providedTargets && providedTargets.length > 0) {
      targetActors = providedTargets.map((t) => ({
        uuid: t.actor?.uuid || t.uuid,
        name: t.actor?.name || t.name,
        img: t.actor?.img || t.img,
      }));
    } else if (game.user.targets.size > 0) {
      targetActors = Array.from(game.user.targets).map((t) => ({
        uuid: t.actor.uuid,
        name: t.actor.name,
        img: t.actor.img,
      }));
    } else if (actor) {
      // Fallback to provided actor if no targets
      targetActors = [
        {
          uuid: actor.uuid,
          name: actor.name,
          img: actor.img,
        },
      ];
    }

    const defaultDuration = statusCondition.duration || {};
    const specialDuration =
      statusCondition.flags?.dasu?.specialDuration || 'none';

    // Prepare context for template
    const context = {
      statusId,
      statusName: game.i18n.localize(statusCondition.name),
      statusImg: statusCondition.img,
      statusDescription: statusCondition.description
        ? game.i18n.localize(statusCondition.description)
        : '',
      duration: {
        turns: defaultDuration.turns || '',
        rounds: defaultDuration.rounds || '',
      },
      specialDuration,
      specialDurationOptions: {
        none: 'DASU.Effect.SpecialDuration.None',
        removeOnCombatEnd: 'DASU.Effect.SpecialDuration.RemoveOnCombatEnd',
      },
      sourceActor: sourceActor,
      targets: targetActors.length > 0 ? targetActors : null,
    };

    // Render the content
    const content = await foundry.applications.handlebars.renderTemplate(
      'systems/dasu/templates/dialogs/status-effect-dialog.hbs',
      context
    );

    // Configure DialogV2 options
    const dialogOptions = {
      window: {
        title: 'Apply Status Effect',
        icon: 'fa-solid fa-syringe',
      },
      position: { width: 400 },
      content,
      classes: ['dasu', 'status-effect-dialog'],
      buttons: [
        {
          action: 'cancel',
          icon: 'fa-solid fa-times',
          label: 'Cancel',
        },
        {
          action: 'apply',
          icon: 'fa-solid fa-check',
          label: 'Apply Effect',
          default: true,
          callback: (event, button, dialog) => {
            const form = dialog.element.querySelector('form');
            if (form) {
              const formData = new foundry.applications.ux.FormDataExtended(
                form
              );
              return { action: 'apply', formData: formData.object };
            }
            return { action: 'cancel' };
          },
        },
      ],
      render: (event, dialog) => {
        // Handle special duration toggle
        const specialDurationSelect =
          dialog.element.querySelector('#specialDuration');
        const durationInputs = dialog.element.querySelectorAll(
          '.duration-input input'
        );

        const toggleDurationFields = () => {
          const isSpecialDuration = specialDurationSelect.value !== 'none';
          durationInputs.forEach((input) => {
            input.disabled = isSpecialDuration;
            if (isSpecialDuration) {
              input.value = '';
            }
          });
        };

        // Initial state
        toggleDurationFields();

        // Listen for changes
        if (specialDurationSelect) {
          specialDurationSelect.addEventListener(
            'change',
            toggleDurationFields
          );
        }

        // Set up drag-and-drop for target actors
        const targetsDropZone = dialog.element.querySelector(
          '.effect-targets-list'
        );
        if (targetsDropZone) {
          targetsDropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.currentTarget.classList.remove('drag-over');

            try {
              const data = JSON.parse(e.dataTransfer.getData('text/plain'));
              let droppedActor = null;

              if (data.type === 'Actor') {
                droppedActor = await fromUuid(data.uuid);
              } else if (data.type === 'Token') {
                const token = await fromUuid(data.uuid);
                droppedActor = token?.actor;
              }

              if (droppedActor) {
                // Check if already in list
                const existingTargets =
                  dialog.element.querySelectorAll('.target-item');
                const alreadyExists = Array.from(existingTargets).some(
                  (item) => item.dataset.actorUuid === droppedActor.uuid
                );

                if (!alreadyExists) {
                  // Add to targetActors array
                  targetActors.push({
                    uuid: droppedActor.uuid,
                    name: droppedActor.name,
                    img: droppedActor.img,
                  });

                  // Remove placeholder if it exists
                  const placeholder =
                    targetsDropZone.querySelector('.drop-placeholder');
                  if (placeholder) {
                    placeholder.remove();
                  }

                  // Create new target item
                  const targetItem = document.createElement('div');
                  targetItem.className = 'target-item';
                  targetItem.dataset.actorUuid = droppedActor.uuid;
                  targetItem.innerHTML = `
                    <img src="${droppedActor.img}" alt="${droppedActor.name}" class="target-avatar">
                    <span class="target-name">${droppedActor.name}</span>
                    <button type="button" data-action="removeTarget" class="remove-target-btn">
                      <i class="fas fa-times"></i>
                    </button>
                  `;

                  targetsDropZone.appendChild(targetItem);

                  // Attach remove listener
                  const removeBtn = targetItem.querySelector(
                    '[data-action="removeTarget"]'
                  );
                  if (removeBtn) {
                    removeBtn.addEventListener('click', (e) => {
                      e.preventDefault();
                      const uuid = targetItem.dataset.actorUuid;
                      const index = targetActors.findIndex(
                        (t) => t.uuid === uuid
                      );
                      if (index > -1) {
                        targetActors.splice(index, 1);
                      }
                      targetItem.remove();

                      // Show placeholder if no targets
                      if (targetActors.length === 0) {
                        targetsDropZone.innerHTML = `
                          <div class="drop-placeholder">
                            <i class="fas fa-bullseye"></i>
                            <p>Target tokens or drag actors here</p>
                          </div>
                        `;
                      }
                    });
                  }
                }
              }
            } catch (error) {
              console.error('Error handling drop:', error);
            }
          });

          targetsDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.currentTarget.classList.add('drag-over');
          });

          targetsDropZone.addEventListener('dragleave', (e) => {
            e.currentTarget.classList.remove('drag-over');
          });

          // Handle existing remove buttons
          const removeButtons = targetsDropZone.querySelectorAll(
            '[data-action="removeTarget"]'
          );
          removeButtons.forEach((btn) => {
            btn.addEventListener('click', (e) => {
              e.preventDefault();
              const targetItem = btn.closest('.target-item');
              const uuid = targetItem.dataset.actorUuid;
              const index = targetActors.findIndex((t) => t.uuid === uuid);
              if (index > -1) {
                targetActors.splice(index, 1);
              }
              targetItem.remove();

              // Show placeholder if no targets
              if (targetActors.length === 0) {
                targetsDropZone.innerHTML = `
                  <div class="drop-placeholder">
                    <i class="fas fa-bullseye"></i>
                    <p>Target tokens or drag actors here</p>
                  </div>
                `;
              }
            });
          });
        }

        // Set up drag-and-drop for source actor
        const dropZone = dialog.element.querySelector('.source-actor-drop');
        if (dropZone) {
          dropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.currentTarget.classList.remove('drag-over');

            try {
              const data = JSON.parse(e.dataTransfer.getData('text/plain'));
              if (data.type === 'Actor') {
                const droppedActor = await fromUuid(data.uuid);
                if (droppedActor) {
                  sourceActor = droppedActor;
                  // Update just the source actor display
                  const sourceActorDisplay =
                    dialog.element.querySelector('.source-actor-drop');
                  if (sourceActorDisplay) {
                    sourceActorDisplay.innerHTML = `
                      <div class="source-actor-display">
                        <img src="${sourceActor.img}" alt="${sourceActor.name}" class="source-avatar">
                        <span>${sourceActor.name}</span>
                        <button type="button" data-action="clearSource" class="clear-source-btn">
                          <i class="fas fa-times"></i>
                        </button>
                      </div>
                    `;
                    // Re-attach clear button listener
                    const clearBtn = sourceActorDisplay.querySelector(
                      '[data-action="clearSource"]'
                    );
                    if (clearBtn) {
                      clearBtn.addEventListener('click', async (e) => {
                        e.preventDefault();
                        sourceActor = null;
                        sourceActorDisplay.innerHTML = `
                          <div class="drop-placeholder">
                            <i class="fas fa-user"></i>
                            <p>Drag an Actor here to set as source</p>
                          </div>
                        `;
                      });
                    }
                  }
                }
              }
            } catch (error) {
              console.error('Error handling drop:', error);
            }
          });

          dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.currentTarget.classList.add('drag-over');
          });

          dropZone.addEventListener('dragleave', (e) => {
            e.currentTarget.classList.remove('drag-over');
          });
        }

        // Clear source actor button (if it exists on initial render)
        const clearButton = dialog.element.querySelector(
          '[data-action="clearSource"]'
        );
        if (clearButton) {
          clearButton.addEventListener('click', async (e) => {
            e.preventDefault();
            sourceActor = null;
            const sourceActorDisplay =
              dialog.element.querySelector('.source-actor-drop');
            if (sourceActorDisplay) {
              sourceActorDisplay.innerHTML = `
                <div class="drop-placeholder">
                  <i class="fas fa-user"></i>
                  <p>Drag an Actor here to set as source</p>
                </div>
              `;
            }
          });
        }
      },
      submit: async (result) => {
        if (result.action === 'apply') {
          const formData = result.formData;

          // Check if we have targets
          if (targetActors.length === 0) {
            ui.notifications.warn('No target actors selected');
            return { applied: false };
          }

          const duration = {};
          let customTurnTracking = false;
          let turnCount = 0;

          if (formData.turns && formData.turns !== '') {
            turnCount = parseInt(formData.turns);
            // Set duration.turns to null to disable Foundry's automatic decrement
            // We'll track turns manually via flags
            duration.turns = null;
            customTurnTracking = true;
          }
          if (formData.rounds && formData.rounds !== '') {
            duration.rounds = parseInt(formData.rounds);
          }

          const effectData = {
            name: game.i18n.localize(statusCondition.name),
            img: statusCondition.img,
            statuses: [statusId],
            tint: statusCondition.tint,
            origin: sourceActor?.uuid || targetActors[0].uuid,
            duration,
            flags: foundry.utils.deepClone(statusCondition.flags || {}),
          };

          // Add custom turn tracking flag
          if (customTurnTracking) {
            effectData.flags.dasu = effectData.flags.dasu || {};
            effectData.flags.dasu.remainingTurns = turnCount;
          }

          // Add description if it exists
          if (statusCondition.description) {
            effectData.description = game.i18n.localize(
              statusCondition.description
            );
          }

          // Add changes if they exist
          if (statusCondition.changes) {
            effectData.changes = foundry.utils.deepClone(
              statusCondition.changes
            );
          }

          // Set special duration
          if (formData.specialDuration && formData.specialDuration !== 'none') {
            effectData.flags.dasu = effectData.flags.dasu || {};
            effectData.flags.dasu.specialDuration = formData.specialDuration;
          } else if (effectData.flags?.dasu?.specialDuration) {
            // Remove special duration if set to none
            delete effectData.flags.dasu.specialDuration;
          }

          // Link to combat if needed
          // IMPORTANT: Only link rounds to combat, NOT custom turn tracking
          if (game.combat && effectData.duration.rounds) {
            effectData.duration.combat = game.combat.id;
            effectData.duration.startRound = game.combat.round;
            effectData.duration.startTurn = game.combat.turn;
          }

          // For custom turn tracking, store combat ID in flags instead
          if (customTurnTracking && game.combat) {
            effectData.flags.dasu.linkedCombat = game.combat.id;
            effectData.flags.dasu.startRound = game.combat.round;
            effectData.flags.dasu.startTurn = game.combat.turn;
            effectData.flags.dasu.hasDecrementedOnce = false;
          }

          console.log('DASU | Creating effect with custom turn tracking:', {
            name: effectData.name,
            remainingTurns: effectData.flags?.dasu?.remainingTurns,
            linkedCombat: effectData.flags?.dasu?.linkedCombat,
            startRound: effectData.flags?.dasu?.startRound,
            hasDecrementedOnce: effectData.flags?.dasu?.hasDecrementedOnce,
            duration: effectData.duration,
            targets: targetActors.length,
          });

          // Apply the effect to all target actors
          const isStackable = statusCondition.flags?.dasu?.stackable;
          for (const target of targetActors) {
            const targetActor = await fromUuid(target.uuid);
            if (targetActor) {
              if (isStackable) {
                await targetActor.addStackableEffect(effectData);
              } else {
                await targetActor.createEmbeddedDocuments('ActiveEffect', [
                  effectData,
                ]);
              }
            }
          }

          ui.notifications.info(
            `${effectData.name} applied to ${targetActors.length} actor(s)`
          );

          return { applied: true };
        }
        return { applied: false };
      },
    };

    return foundry.applications.api.DialogV2.wait(dialogOptions);
  }
}
