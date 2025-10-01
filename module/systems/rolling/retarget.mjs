import { contextMenu } from './context-menu.mjs';

async function retargetCheck(context) {
  const { message, checkResult, sourceActor, item, currentTargets } = context;

  if (!checkResult || !sourceActor || !item) {
    ui.notifications.error('Could not find required check information');
    return;
  }

  if (currentTargets.size === 0) {
    ui.notifications.warn('No tokens are currently targeted');
    return;
  }

  try {
    const newTargetedIndividuals = Array.from(currentTargets).map((token) => ({
      actorId: token.actor.id,
      tokenId: token.id,
      name: token.name,
      result: checkResult.targetedIndividuals?.[0]?.result || 'hit',
    }));

    const updatedCheckResult = foundry.utils.mergeObject(checkResult, {
      targetedIndividuals: newTargetedIndividuals,
    });

    const sections = [];
    Hooks.call(
      'dasu.renderCheck',
      sections,
      updatedCheckResult,
      sourceActor,
      item
    );

    let content = '';
    const sortedSections = sections.sort(
      (a, b) => (a.order || 0) - (b.order || 0)
    );

    for (const section of sortedSections) {
      if (section.partial) {
        content += await foundry.applications.handlebars.renderTemplate(
          section.partial,
          section.data
        );
      }
    }

    const newChatData = {
      author: message.author,
      speaker: message.speaker,
      content,
      style: message.style,
      flags: foundry.utils.mergeObject(message.flags, {
        dasu: {
          ...message.flags.dasu,
          checkResult: updatedCheckResult,
        },
      }),
    };

    await ChatMessage.create(newChatData);
    await message.delete();

    ui.notifications.info(
      `Updated ${item.name} with ${currentTargets.size} new target(s)`
    );
  } catch (error) {
    ui.notifications.error('Failed to update targets');
  }
}

function initialize() {
  contextMenu.registerOption('retarget', {
    name: 'DASU.ContextMenu.Retarget',
    icon: '<i class="fas fa-crosshairs"></i>',
    condition: (context) => context.hasCheckResult && !!context.item,
    callback: retargetCheck,
    order: 10,
  });
}

export const Retarget = Object.freeze({
  initialize,
  retargetCheck,
});
