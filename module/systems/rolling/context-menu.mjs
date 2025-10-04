/* global fromUuidSync */
export class ContextMenuManager {
  constructor() {
    this.options = new Map();
    this.initialized = false;
  }

  registerOption(id, option) {
    if (!option.name || !option.callback) {
      throw new Error('Context menu option must have name and callback');
    }

    this.options.set(id, {
      icon: '<i class="fas fa-cog"></i>',
      condition: () => true,
      order: 100,
      ...option,
    });
  }

  unregisterOption(id) {
    return this.options.delete(id);
  }

  getOrderedOptions() {
    return Array.from(this.options.entries())
      .map(([id, option]) => ({ id, option }))
      .sort((a, b) => (a.option.order || 100) - (b.option.order || 100));
  }

  addContextMenuOptions(html, foundryOptions) {
    const orderedOptions = this.getOrderedOptions();

    for (const { id, option } of orderedOptions) {
      foundryOptions.push({
        name: option.name,
        icon: option.icon,
        condition: (li) => {
          try {
            return this._evaluateCondition(li, option);
          } catch (error) {
            return false;
          }
        },
        callback: async (li) => {
          try {
            const context = this._buildContext(li);
            await option.callback(context);
          } catch (error) {
            ui.notifications.error(`Failed to execute ${option.name}`);
          }
        },
      });
    }
  }

  _evaluateCondition(li, option) {
    const context = this._buildContext(li);
    if (!context.hasCheckResult || !game.user.isGM) {
      return false;
    }
    return option.condition(context);
  }

  _buildContext(li) {
    const messageId = li.dataset
      ? li.dataset.messageId
      : li.data
      ? li.data('messageId')
      : li.getAttribute('data-message-id');

    const message = game.messages.get(messageId);
    const checkResult = message?.flags?.dasu?.checkResult;
    const hasCheckResult = !!checkResult;

    let sourceActor = null;
    let item = null;

    if (checkResult) {
      if (checkResult.actorUuid) {
        sourceActor = fromUuidSync(checkResult.actorUuid);
      }

      if (checkResult.itemUuid && sourceActor) {
        item = fromUuidSync(checkResult.itemUuid);
      }
    }

    return {
      messageId,
      message,
      checkResult,
      hasCheckResult,
      sourceActor,
      item,
      isGM: game.user.isGM,
      currentTargets: game.user.targets,
      li,
    };
  }

  initialize() {
    if (this.initialized) return;

    Hooks.on('getChatLogEntryContext', (html, options) => {
      this.addContextMenuOptions(html, options);
    });

    Hooks.on('getChatMessageContextOptions', (html, options) => {
      this.addContextMenuOptions(html, options);
    });

    this.initialized = true;
  }
}

export const contextMenu = new ContextMenuManager();
