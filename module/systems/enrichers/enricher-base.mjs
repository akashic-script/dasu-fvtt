/**
 * @fileoverview Base Enricher Utilities
 *
 * Provides shared utilities for all DASU text enrichers to avoid code duplication
 * while maintaining extensibility for each enricher type.
 *
 * All enrichers follow a consistent pattern:
 * 1. Parse enricher text from regex match
 * 2. Create clickable HTML links
 * 3. Handle click events
 * 4. Execute enricher-specific logic
 */
/* global canvas, CONST */

/**
 * Get source actor from enricher context
 * Works in chat messages, sheets, and fallback to controlled token
 *
 * @param {HTMLElement} element - The enricher element
 * @returns {Actor|null} The source actor
 */
export function getSourceActor(element) {
  // Try to find actor from chat message
  const message = element.closest('.message');
  if (message) {
    const messageId = message.dataset.messageId;
    const chatMessage = game.messages.get(messageId);
    if (chatMessage?.speaker?.actor) {
      const actor = game.actors.get(chatMessage.speaker.actor);
      if (actor) return actor;
    }
    // Try to get token actor from chat message
    if (chatMessage?.speaker?.token) {
      const token = canvas?.scene?.tokens?.get(chatMessage.speaker.token);
      if (token?.actor) return token.actor;
    }
  }

  // Try to find actor from sheet
  const sheet = element.closest('.sheet, .window-app');
  if (sheet) {
    // Try to find app by data-appid first
    const appId = sheet.dataset.appid;
    if (appId) {
      const app = ui.windows[appId];
      if (app) {
        const actor = app.actor || app.document?.actor || app.document;
        if (actor) return actor;
      }
    }

    // Try to find by matching element
    for (const app of Object.values(ui.windows)) {
      if (app.element && app.element[0] === sheet) {
        const actor = app.actor || app.document?.actor || app.document;
        if (actor) return actor;
      }
    }

    // Try to find by sheet ID (e.g., "DASUActorSheet-Actor-sOliklue9B5RsrZj")
    const sheetId = sheet.id;
    if (sheetId) {
      for (const app of Object.values(ui.windows)) {
        if (
          app.id === sheetId ||
          (app.element && app.element[0]?.id === sheetId)
        ) {
          const actor = app.actor || app.document?.actor || app.document;
          if (actor) return actor;
        }
      }
    }
  }

  // Fallback to controlled token
  const controlled = canvas?.tokens?.controlled[0];
  if (controlled?.actor) return controlled.actor;

  // Final fallback to user character
  if (game.user.character) return game.user.character;

  return null;
}

/**
 * Parse multiple instances separated by ampersand
 *
 * @param {string} content - Content string with potential & separators
 * @returns {Array<string>} Array of individual instance strings
 */
export function parseMultipleInstances(content) {
  return content
    .split('&')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Extract custom label from enricher match
 *
 * @param {string} labelMatch - Label match from regex (may include braces)
 * @returns {string|null} Cleaned label or null
 */
export function extractCustomLabel(labelMatch) {
  if (!labelMatch) return null;
  return labelMatch.replace(/^\{|\}$/g, '').trim();
}

/**
 * Create base enricher link element
 *
 * @param {Object} config - Link configuration
 * @param {string} config.cssClass - CSS class for the link
 * @param {string} [config.iconClass] - Font Awesome icon class (for FA icons)
 * @param {string} [config.iconSrc] - Image source path (for image icons)
 * @param {string} config.labelText - Text label for the link
 * @param {string} config.tooltip - Tooltip text
 * @param {Object} config.dataset - Data attributes to add
 * @returns {HTMLAnchorElement} The created link element
 */
export function createEnricherLink(config) {
  const { cssClass, iconClass, iconSrc, labelText, tooltip, dataset } = config;

  const link = document.createElement('a');
  // Handle both single class strings and space-separated class strings
  const classes =
    typeof cssClass === 'string' ? cssClass.split(/\s+/) : [cssClass];
  link.classList.add(...classes, 'content-link');

  // Add data attributes
  if (dataset) {
    Object.entries(dataset).forEach(([key, value]) => {
      link.dataset[key] = value;
    });
  }

  // Add icon - support both Font Awesome and image icons
  if (iconSrc) {
    const icon = document.createElement('img');
    icon.src = iconSrc;
    icon.classList.add('damage-type-icon');
    icon.alt = '';
    link.appendChild(icon);
  } else if (iconClass) {
    const icon = document.createElement('i');
    icon.classList.add('fas', iconClass);
    link.appendChild(icon);
  }

  // Add label text
  link.appendChild(document.createTextNode(' ' + labelText));

  // Add tooltip
  if (tooltip) {
    link.dataset.tooltip = tooltip;
  }

  return link;
}

/**
 * Create container span for multiple enricher instances
 *
 * @param {string} cssClass - CSS class for the container
 * @param {Array<HTMLElement>} instances - Array of link elements
 * @param {string} separator - Separator text between instances (default: ' & ')
 * @returns {HTMLSpanElement} Container element with all instances
 */
export function createEnricherContainer(
  cssClass,
  instances,
  separator = ' & '
) {
  const span = document.createElement('span');
  span.classList.add(cssClass);

  for (let i = 0; i < instances.length; i++) {
    span.appendChild(instances[i]);

    // Add separator between instances
    if (i < instances.length - 1) {
      span.appendChild(document.createTextNode(separator));
    }
  }

  return span;
}

/**
 * Register an enricher with Foundry's text editor
 *
 * @param {Object} enricherConfig - Enricher configuration
 * @param {RegExp} enricherConfig.pattern - Regex pattern to match
 * @param {Function} enricherConfig.enricher - Enricher function
 */
export function registerEnricher(enricherConfig) {
  CONFIG.TextEditor.enrichers.push(enricherConfig);
}

/**
 * Register a click handler for enricher links
 * Uses event delegation for efficient handling
 *
 * @param {string} selector - CSS selector for enricher links
 * @param {Function} handler - Click handler function
 */
export function registerEnricherClickHandler(selector, handler) {
  Hooks.once('ready', () => {
    document.addEventListener('click', (event) => {
      const link = event.target.closest(selector);
      if (link) {
        // Create wrapper event that delegates to original but overrides currentTarget
        const enricherEvent = new Proxy(event, {
          get(target, prop) {
            if (prop === 'currentTarget') {
              return link;
            }
            const value = target[prop];
            // Bind methods to the original event object
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
        handler(enricherEvent);
      }
    });
  });
}

/**
 * Create a complete enricher initialization function
 * This factory creates consistent initialization functions for all enrichers
 *
 * @param {Object} config - Configuration object
 * @param {string} config.name - Enricher name (for logging)
 * @param {RegExp} config.pattern - Regex pattern
 * @param {Function} config.enricher - Enricher function
 * @param {string} config.selector - CSS selector for click handler
 * @param {Function} config.clickHandler - Click handler function
 * @returns {Function} Initialization function
 */
export function createEnricherInitializer(config) {
  const { name, pattern, enricher, selector, clickHandler } = config;

  return function initialize() {
    // Register the enricher
    registerEnricher({ pattern, enricher });

    // Register click handler
    registerEnricherClickHandler(selector, clickHandler);

    console.log(`DASU | ${name} enricher initialized`);
  };
}

/**
 * Parse tokens from enricher content
 * Common pattern: first token is formula/id, remaining are modifiers
 *
 * @param {string} text - Text to parse
 * @returns {Array<string>} Array of tokens
 */
export function tokenizeEnricherContent(text) {
  return text.split(/\s+/).filter((token) => token.length > 0);
}

/**
 * Validate and get a value from a set of allowed values
 *
 * @param {string} value - Value to validate
 * @param {Array<string>} allowedValues - Array of allowed values
 * @param {string} defaultValue - Default value if validation fails
 * @param {string} warningMessage - Warning message for invalid values
 * @returns {string} Valid value or default
 */
export function validateEnricherValue(
  value,
  allowedValues,
  defaultValue,
  warningMessage
) {
  if (!value) return defaultValue;

  const lowerValue = value.toLowerCase();
  if (!allowedValues.includes(lowerValue)) {
    if (warningMessage) {
      console.warn(warningMessage, value);
    }
    return defaultValue;
  }

  return lowerValue;
}

/**
 * Safe error wrapper for enricher functions
 * Catches errors and logs them without breaking the enrichment process
 *
 * Note: Preventing enrichment in <code> blocks is not easily achievable with Foundry's
 * enricher system since enrichers work on text content before DOM structure exists.
 * A workaround is to use HTML entities in code blocks: &lsqb;&lsqb;/damage 2d6&rsqb;&rsqb;
 *
 * @param {Function} enricherFn - Enricher function to wrap
 * @param {string} enricherName - Name for error logging
 * @returns {Function} Wrapped enricher function
 */
export function wrapEnricher(enricherFn, enricherName) {
  return async function (match, options) {
    try {
      return await enricherFn(match, options);
    } catch (error) {
      console.error(`Error enriching ${enricherName}:`, error);
      return null;
    }
  };
}

/**
 * Get current user's targets
 *
 * @returns {Array<Token>} Array of targeted tokens
 */
export function getTargets() {
  return Array.from(game.user.targets);
}

/**
 * Get controlled tokens
 *
 * @returns {Array<Token>} Array of controlled tokens
 */
export function getControlledTokens() {
  return canvas?.tokens?.controlled || [];
}

/**
 * Build a simple chat message for enricher actions
 *
 * @param {Object} config - Message configuration
 * @param {Actor} config.actor - Source actor
 * @param {string} config.title - Message title
 * @param {string} config.content - HTML content
 * @param {string} config.cssClass - CSS class for message
 * @param {Object} config.flags - Additional flags to include
 * @returns {Promise<ChatMessage>} Created chat message
 */
export async function createEnricherChatMessage(config) {
  const { actor, title, content, cssClass, flags } = config;

  const speaker = ChatMessage.getSpeaker({ actor });

  let html = `<div class="dasu ${cssClass}">`;
  if (title) {
    html += `<div class="enricher-header">${title}</div>`;
  }
  html += `<div class="enricher-content">${content}</div>`;
  html += '</div>';

  return await ChatMessage.create({
    user: game.user.id,
    speaker: speaker,
    content: html,
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    flags: {
      dasu: flags || {},
    },
  });
}
