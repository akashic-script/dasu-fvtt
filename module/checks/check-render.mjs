import { CheckHooks } from './check-hooks.mjs';
import { CheckConfiguration } from './check-configuration.mjs';
import { DASU, SYSTEM } from '../helpers/config.mjs';
import { Flags } from '../helpers/flags.mjs';

const { renderTemplate } = foundry.applications.handlebars;
const systemTpl = (path) => `systems/${SYSTEM}/templates/${path}.hbs`;

/**
 * Fire the renderCheck hook, resolve and order the contributed sections, then
 * create the chat message. The result is stored as a flag so it can later be
 * pushed, rerolled, or retargeted.
 *
 * @param {CheckResult} result
 * @param {FUActor} actor
 * @param {FUItem} [item]
 * @param {Record<string, any>} [flags]
 * @returns {Promise<ChatMessage>}
 */
export async function renderCheck(result, actor, item, flags = {}) {
  /** @type {DASURenderData} */
  const renderData = { sections: [], postRenderActions: [], tags: [] };
  const additionalFlags = {};

  Hooks.callAll(
    CheckHooks.renderCheck,
    renderData,
    result,
    actor,
    item,
    additionalFlags
  );

  const resolved = await Promise.all(
    renderData.sections.map(async (s) => (typeof s === 'function' ? s() : s))
  );
  resolved.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const sectionHtml = [];
  for (const section of resolved) {
    if (section.content != null) {
      sectionHtml.push(section.content);
    } else if (section.partial) {
      sectionHtml.push(
        await renderTemplate(section.partial, section.data ?? {})
      );
    }
  }

  const inspector = CheckConfiguration.inspect(result);
  const flavorTitle = game.i18n.localize(
    DASU.checkTypes[result.type] ?? 'DASU.Check.Type.Open'
  );
  const label = inspector.getLabel();

  const content = await renderTemplate(systemTpl('chat/chat-check'), {
    checkTitle: flavorTitle,
    checkLabel: label ?? null,
    checkType: result.type,
    sections: sectionHtml,
    tags: renderData.tags,
  });

  const rolls = result.type === 'display' ? [] : [Roll.fromData(result.roll)];
  const messageData = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls,
    flags: foundry.utils.mergeObject(
      {
        [SYSTEM]: {
          // Deep-clone: `result` is frozen, but Foundry mutates flag values while cleaning.
          [Flags.ChatMessage.Check]: foundry.utils.deepClone(result),
          [Flags.ChatMessage.Item]: item?.uuid,
        },
      },
      foundry.utils.mergeObject(flags, additionalFlags, { inplace: false })
    ),
  };

  const message = await ChatMessage.create(messageData);
  for (const action of renderData.postRenderActions) await action;
  return message;
}
