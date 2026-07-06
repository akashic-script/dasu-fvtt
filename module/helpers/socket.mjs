import { SYSTEM } from './config.mjs';
import { getPipeline } from './pipelines/_module.mjs';

/**
 * DASUSocketHandler
 *
 * A thin wrapper over Foundry's native `game.socket`. It lets a player hand
 * work to a client that has the permissions to do it, specifically the active GM
 * without depending on the external `socketlib` module.
 *
 * Everything that crosses the wire must be plain JSON: pass UUIDs and plain data
 * bags, never live `Actor`/`Item`/`Token` instances. The receiver rehydrates
 * documents GM-side via `fromUuid`.
 *
 * Community wiki article on sockets: https://foundryvtt.wiki/en/development/api/sockets
 */

/**
 * Named socket messages this handler routes.
 * @readonly
 * @enum {string}
 */
export const DASU_MESSAGES = Object.freeze({
  Pipeline: 'pipeline',
  // Reserved for later: RequestStartTurn, RequestEndTurn, ShowBanner
});

/**
 * Base shape of a socket message envelope.
 * @typedef {Object} SocketMessage
 * @property {string} id         Unique identifier for the message
 * @property {number} timestamp  When the message was created
 * @property {string} sender     ID of the user that originated the message
 * @property {string} name       Registered handler name
 * @property {string[]} users    User IDs that should process the message
 * @property {any[]} args        Arguments passed to the handler function
 */

export class DASUSocketHandler {
  /**
   * The socket channel. MUST be `system.<id>`.
   * @type {string}
   */
  identifier = `system.${SYSTEM}`;

  /** @type {Map<string, Function>} */
  #handlers = new Map();

  constructor() {
    this.registerSocketHandlers();
  }

  /**
   * Register a message handler.
   * @param {string} name       Message name to register
   * @param {Function} handler  Called when a message of this name is received
   */
  register(name, handler) {
    if (!(handler instanceof Function)) return;
    if (this.#handlers.has(name)) {
      throw new Error(
        game.i18n.format('DASU.Socket.AlreadyRegistered', { name })
      );
    }
    this.#handlers.set(name, handler);
  }

  /**
   * Unregister a message handler.
   * @param {string} name
   * @returns {boolean} whether a handler was removed
   */
  unregister(name) {
    return this.#handlers.delete(name);
  }

  /**
   * Execute a handler as a specific user.
   * @param {string} name    Registered handler name
   * @param {string} userId
   * @param {...any} args
   */
  async executeAsUser(name, userId, ...args) {
    return this.sendMessage(name, [userId], args);
  }

  /**
   * Execute a handler for a set of users.
   * @param {string} name       Registered handler name
   * @param {string[]} users
   * @param {...any} args
   */
  async executeForUsers(name, users, ...args) {
    return this.sendMessage(name, users, args);
  }

  /**
   * Execute a handler for every active user.
   * @param {string} name  Registered handler name
   * @param {...any} args
   */
  async executeForEveryone(name, ...args) {
    const users = game.users.filter((u) => u.active).map((u) => u.id);
    return this.sendMessage(name, users, args);
  }

  /**
   * Execute a handler as the single active GM (deterministic, runs once).
   * @param {string} name  Registered handler name
   * @param {...any} args
   */
  async executeAsGM(name, ...args) {
    if (game.users.activeGM) {
      return this.sendMessage(name, [game.users.activeGM.id], args);
    }
  }

  /**
   * Build the frozen envelope, run locally if we're a recipient, and emit only
   * when other recipients exist.
   * @param {string} name       Registered handler name
   * @param {string[]} users    Recipient user IDs
   * @param {any[]} args        Handler arguments
   */
  async sendMessage(name, users, args) {
    const handler = this.#handlers.get(name);
    if (!handler) return;

    const message = foundry.utils.deepFreeze({
      id: foundry.utils.randomID(),
      timestamp: Date.now(),
      sender: game.user?.id,
      name,
      users,
      args,
    });

    // socket.emit does NOT echo to the sender, so run locally when we're a target.
    if (message.users.includes(game.user.id)) {
      handler.apply(undefined, [...message.args, message]);
    }
    // Only hit the wire if someone other than us needs it.
    if (message.users.some((id) => id !== game.user.id)) {
      game.socket.emit(this.identifier, message);
    }
  }

  /** Register built-in handlers and the incoming-message listener. */
  registerSocketHandlers() {
    this.register(DASU_MESSAGES.Pipeline, this.requestPipeline.bind(this));

    game.socket.on(this.identifier, (message) => {
      if (
        Array.isArray(message.users) &&
        !message.users.includes(game.user.id)
      ) {
        return;
      }
      const handler = this.#handlers.get(message.name);
      if (!(handler instanceof Function)) return;
      // Guard against a malformed peer message: args must be spreadable.
      if (!Array.isArray(message.args)) return;
      const frozen = foundry.utils.deepFreeze(message);
      handler.apply(undefined, [...frozen.args, frozen]);
    });
  }

  /**
   * Requestor: run a DASU pipeline as the active GM.
   *
   * If the caller is not the GM, this hands off to the GM client, which
   * re-enters this method GM-side (the socket receiver dispatches by name).
   * @param {string} type  pipeline id ('damage' | 'resource' | 'effect')
   * @param {{input: object, source: object, targetUuid: string}} data  JSON-only
   */
  async requestPipeline(type, data) {
    try {
      if (!game.users.activeGM) {
        throw new Error(game.i18n.localize('DASU.Socket.NoActiveGM'));
      }
      if (!game.user.isGM) {
        // Hand off to the GM client, which re-enters this method GM-side.
        return this.executeAsGM(DASU_MESSAGES.Pipeline, type, data);
      }
      const pipeline = getPipeline(type);
      if (!pipeline) return;
      await pipeline.applyToTargets(data.input, data.source, {
        uuid: data.targetUuid,
      });
    } catch (err) {
      ui.notifications.error(err.message, { localize: false });
    }
  }
}
