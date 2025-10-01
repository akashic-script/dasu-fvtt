/**
 * Custom Status Conditions for DASU
 * These replace Foundry's default status conditions with DASU-specific ones
 */

export const DASU_STATUS_CONDITIONS = {
  // Physical Status
  bleeding: {
    id: 'bleeding',
    name: 'DASU.Status.Bleeding',
    img: 'icons/svg/blood.svg',
    tint: '#d66660',
    description: 'DASU.Status.Description.Bleeding',
  },
  stunned: {
    id: 'stunned',
    name: 'DASU.Status.Stunned',
    img: 'icons/svg/daze.svg',
    tint: '#d4a870',
    description: 'DASU.Status.Description.Stunned',
  },
  sleep: {
    id: 'sleep',
    name: 'DASU.Status.Sleep',
    img: 'icons/svg/sleep.svg',
    tint: '#8bb5d0',
    description: 'DASU.Status.Description.Sleep',
  },
  restrained: {
    id: 'restrained',
    name: 'DASU.Status.Restrained',
    img: 'icons/svg/net.svg',
    tint: '#805555',
    description: 'DASU.Status.Description.Restrained',
  },

  // Mental Status
  charmed: {
    id: 'charmed',
    name: 'DASU.Status.Charmed',
    img: 'icons/svg/stoned.svg',
    tint: '#d080a0',
    description: 'DASU.Status.Description.Charmed',
  },
  dazed: {
    id: 'dazed',
    name: 'DASU.Status.Dazed',
    img: 'icons/svg/daze.svg',
    tint: '#d0bd80',
    description: 'DASU.Status.Description.Dazed',
  },
  despair: {
    id: 'despair',
    name: 'DASU.Status.Despair',
    img: 'icons/svg/falling.svg',
    tint: '#7560a0',
    description: 'DASU.Status.Description.Despair',
  },
  rage: {
    id: 'rage',
    name: 'DASU.Status.Rage',
    img: 'icons/svg/terror.svg',
    tint: '#a06666',
    description: 'DASU.Status.Description.Rage',
  },

  // Magical Status
  cursed: {
    id: 'cursed',
    name: 'DASU.Status.Cursed',
    img: 'icons/svg/skull.svg',
    tint: '#806088',
    description: 'DASU.Status.Description.Cursed',
  },
  empowered: {
    id: 'empowered',
    name: 'DASU.Status.Empowered',
    img: 'icons/svg/upgrade.svg',
    tint: '#70a070',
    description: 'DASU.Status.Description.Empowered',
  },
  focused: {
    id: 'focused',
    name: 'DASU.Status.Focused',
    img: 'icons/svg/target.svg',
    tint: '#7090c0',
    description: 'DASU.Status.Description.Focused',
  },
  unraveled: {
    id: 'unraveled',
    name: 'DASU.Status.Unraveled',
    img: 'icons/svg/lever.svg',
    tint: '#c0709a',
    description: 'DASU.Status.Description.Unraveled',
  },

  // Sensory Status
  invisible: {
    id: 'invisible',
    name: 'DASU.Status.Invisible',
    img: 'icons/svg/invisible.svg',
    tint: '#b0b0b0',
    description: 'DASU.Status.Description.Invisible',
  },
  silenced: {
    id: 'silenced',
    name: 'DASU.Status.Silenced',
    img: 'icons/svg/silenced.svg',
    tint: '#909090',
    description: 'DASU.Status.Description.Silenced',
  },

  // Health Status
  infected: {
    id: 'infected',
    name: 'DASU.Status.Infected',
    img: 'icons/svg/poison.svg',
    tint: '#80a080',
    description: 'DASU.Status.Description.Infected',
  },

  // Combat Status
  guarded: {
    id: 'guarded',
    name: 'DASU.Status.Guarded',
    img: 'icons/svg/shield.svg',
    tint: '#7080c0',
    description: 'DASU.Status.Description.Guarded',
  },
  unguarded: {
    id: 'unguarded',
    name: 'DASU.Status.Unguarded',
    img: 'icons/svg/mage-shield.svg',
    tint: '#d0906a',
    description: 'DASU.Status.Description.Unguarded',
  },
};

/**
 * Register custom status conditions with Foundry
 */
export function registerStatusConditions() {
  // Set status effects as an array for Foundry V13+
  CONFIG.statusEffects = Object.values(DASU_STATUS_CONDITIONS).map(
    (status) => ({
      id: status.id,
      name: status.name,
      img: status.img,
      tint: status.tint,
      description: game.i18n.localize(status.description),
    })
  );

  // Also make DASU status conditions available on CONFIG for enrichers
  CONFIG.DASU_STATUS_CONDITIONS = DASU_STATUS_CONDITIONS;
}

/**
 * Get status condition by ID
 * @param {string} id - The status condition ID
 * @returns {object|null} The status condition object or null if not found
 */
export function getStatusCondition(id) {
  return DASU_STATUS_CONDITIONS[id] || null;
}

/**
 * Get all status conditions
 * @returns {object} All status conditions
 */
export function getAllStatusConditions() {
  return DASU_STATUS_CONDITIONS;
}

/**
 * Get localized description for a status condition
 * @param {string} id - The status condition ID
 * @returns {string} The localized description or empty string if not found
 */
export function getStatusDescription(id) {
  const status = DASU_STATUS_CONDITIONS[id];
  if (!status) return '';

  return game.i18n.localize(status.description);
}

/**
 * Get localized name for a status condition
 * @param {string} id - The status condition ID
 * @returns {string} The localized name or empty string if not found
 */
export function getStatusName(id) {
  const status = DASU_STATUS_CONDITIONS[id];
  if (!status) return '';

  return game.i18n.localize(status.name);
}
