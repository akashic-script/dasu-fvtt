/**
 * @fileoverview System Controls Framework
 * Provides a centralized way to add custom UI control buttons to the player list
 */

/**
 * @typedef SystemControlTool
 * @property {string} name - Localization key for tooltip
 * @property {string} icon - Font Awesome icon class
 * @property {boolean} [visible] - Whether button is visible (default: true)
 * @property {boolean} [toggle] - Whether button is a toggle (default: false)
 * @property {boolean} [active] - Initial active state for toggles
 * @property {(event: Event, active: boolean) => void} [onClick] - Click handler
 */

let initialized = false;

export const SystemControls = Object.freeze({
  /**
   * Initialize the system controls framework
   * Should be called once during system initialization
   */
  initialize() {
    if (!initialized) {
      initialized = true;

      // Hook into the player list render
      Hooks.on('renderPlayers', (app, element) => {
        // Create the container for system controls
        const containerElement = document.createElement('div');
        containerElement.classList.add('system-controls');

        /** @type {SystemControlTool[]} */
        const systemTools = [];

        // Call hook to allow other modules to register tools
        Hooks.callAll(SystemControls.HOOK_GET_SYSTEM_TOOLS, systemTools);

        // Create buttons from tool definitions
        const menuItems = systemTools
          .filter((tool) => tool.visible !== false)
          .map((tool) => {
            const toolButton = document.createElement('button');
            toolButton.type = 'button';
            toolButton.classList.add('control', 'ui-control');
            toolButton.innerHTML = `<i class="${tool.icon}"></i>`;

            // Set tooltip
            toolButton.dataset.tooltip = game.i18n.localize(tool.name);
            toolButton.dataset.tooltipDirection =
              game.tooltip.constructor.TOOLTIP_DIRECTIONS.UP;

            // Handle toggle buttons
            if (tool.toggle) {
              let active = tool.active;
              toolButton.classList.add('toggle');
              toolButton.ariaPressed = active;

              toolButton.addEventListener('click', (e) => {
                active = !active;
                toolButton.ariaPressed = active;
                if (tool.onClick) {
                  tool.onClick(e, active);
                }
              });
            } else {
              // Handle regular buttons
              if (tool.onClick) {
                toolButton.addEventListener('click', (e) => {
                  tool.onClick(e, false);
                });
              }
            }

            return toolButton;
          });

        // Add all buttons to container
        containerElement.append(...menuItems);

        // Prepend to player list element
        element.prepend(containerElement);
      });
    }
  },

  // Hook name that other modules will use
  HOOK_GET_SYSTEM_TOOLS: 'dasu.getSystemControlTools',
});
