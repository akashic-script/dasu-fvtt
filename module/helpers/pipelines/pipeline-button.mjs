import { SYSTEM } from '../config.mjs';
import { Flags } from '../flags.mjs';

const registry = new Map();

function register(pipeline) {
  registry.set(pipeline.constructor.type, pipeline);
}

/** Inject the action button row into a rendered source check card. */
function inject(message, html) {
  const result = message.getFlag(SYSTEM, Flags.ChatMessage.Check);
  const actions = result?.additionalData?.pipelineActions;
  if (!actions?.length) return;

  const fieldset = html.querySelector('.check-card__fieldset');
  if (!fieldset) return;

  const source = {
    actorUuid: result.actorUuid,
    itemUuid: message.getFlag(SYSTEM, Flags.ChatMessage.Item),
    name: result.itemName ?? message.speaker?.alias,
  };

  const row = document.createElement('div');
  row.classList.add('pipeline-actions');

  // Pinned actions (cost/self): apply to their fixed uuid.
  for (const action of actions) {
    if (!action.uuid) continue;
    const pipeline = registry.get(action.type);
    if (!pipeline) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.classList.add('pipeline-actions__btn');
    const label = game.i18n.localize(action.label) || action.label;
    btn.innerHTML = `${action.icon ? `<i class="${action.icon}"></i> ` : ''}${label}`;
    btn.addEventListener('click', async (event) => {
      event.preventDefault();
      await pipeline.applyToTargets(action.input, source, { uuid: action.uuid });
    });
    row.append(btn);
  }

  // Target actions: one "Apply X to All Hits" button per action, applying to all hit targets.
  const targetActions = actions.filter(
    (a) => !a.uuid && (a.type === 'damage' || a.type === 'effect')
  );
  const hitUuids = [...html.querySelectorAll('.check-target.target-hit .target-name[data-uuid]')]
    .map((el) => el.dataset.uuid)
    .filter(Boolean);

  const targetButtons = hitUuids.length ? targetActions : [];
  for (const action of targetButtons) {
    const pipeline = registry.get(action.type);
    if (!pipeline) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.classList.add('pipeline-actions__btn');
    const actionLabel = game.i18n.localize(action.label) || action.label;
    const allHitsLabel = game.i18n.localize('DASU.Pipeline.ApplyToAllHits');
    btn.innerHTML = `${action.icon ? `<i class="${action.icon}"></i> ` : ''}${actionLabel} ${allHitsLabel}`;
    btn.addEventListener('click', async (event) => {
      event.preventDefault();
      for (const uuid of hitUuids) {
        // For DC-gated effects, skip targets that didn't pass the DC threshold.
        if (action.type === 'effect' && action.input.dcThreshold != null && action.input.rollTotal != null) {
          const doc = fromUuidSync(uuid);
          const targetActor = doc?.actor ?? (doc instanceof Actor ? doc : null);
          const avoid = targetActor?.system?.stats?.avoid?.value ?? 0;
          if (action.input.rollTotal < avoid + action.input.dcThreshold) continue;
        }
        await pipeline.applyToTargets(action.input, source, { uuid });
      }
    });
    row.append(btn);
  }

  if (row.childElementCount) fieldset.append(row);
}

export const PipelineButton = Object.freeze({ register, inject });
