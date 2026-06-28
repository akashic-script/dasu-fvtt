import { SYSTEM } from '../config.mjs';
import { Flags } from '../flags.mjs';

/**
 * Injects pipeline Apply buttons into a source check card. A check supplies
 * `result.additionalData.pipelineActions` ({ type, label, icon, input }[]);
 * each becomes a button that resolves targets and runs the matching pipeline.
 */

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

  for (const action of actions) {
    const pipeline = registry.get(action.type);
    if (!pipeline) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.classList.add('pipeline-actions__btn');
    btn.innerHTML = `${action.icon ? `<i class="${action.icon}"></i> ` : ''}${game.i18n.localize(action.label)}`;
    btn.addEventListener('click', async (event) => {
      event.preventDefault();
      await pipeline.applyToTargets(action.input, source, {
        uuid: action.uuid,
      });
    });
    row.append(btn);
  }

  if (row.childElementCount) fieldset.append(row);
}

export const PipelineButton = Object.freeze({ register, inject });
