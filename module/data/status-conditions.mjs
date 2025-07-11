/**
 * Custom Status Conditions for DASU
 * These replace Foundry's default status conditions with DASU-specific ones
 */

export const DASU_STATUS_CONDITIONS = {
  // Physical Status
  bleeding: {
    id: 'bleeding',
    label: 'DASU.Status.Bleeding',
    icon: 'icons/svg/blood.svg',
    tint: '#ff0000',
    description: 'DASU.Status.Description.Bleeding',
  },
  stunned: {
    id: 'stunned',
    label: 'DASU.Status.Stunned',
    icon: 'icons/svg/daze.svg',
    tint: '#ffaa00',
    description: 'DASU.Status.Description.Stunned',
  },
  sleep: {
    id: 'sleep',
    label: 'DASU.Status.Sleep',
    icon: 'icons/svg/sleep.svg',
    tint: '#87ceeb',
    description: 'DASU.Status.Description.Sleep',
  },
  restrained: {
    id: 'restrained',
    label: 'DASU.Status.Restrained',
    icon: 'icons/svg/net.svg',
    tint: '#8b0000',
    description: 'DASU.Status.Description.Restrained',
  },

  // Mental Status
  charmed: {
    id: 'charmed',
    label: 'DASU.Status.Charmed',
    icon: 'icons/svg/heart.svg',
    tint: '#ff69b4',
    description: 'DASU.Status.Description.Charmed',
  },
  dazed: {
    id: 'dazed',
    label: 'DASU.Status.Dazed',
    icon: 'icons/svg/confusion.svg',
    tint: '#ffd700',
    description: 'DASU.Status.Description.Dazed',
  },
  despair: {
    id: 'despair',
    label: 'DASU.Status.Despair',
    icon: 'icons/svg/sadness.svg',
    tint: '#4b0082',
    description: 'DASU.Status.Description.Despair',
  },
  rage: {
    id: 'rage',
    label: 'DASU.Status.Rage',
    icon: 'icons/svg/berserk.svg',
    tint: '#8b0000',
    description: 'DASU.Status.Description.Rage',
  },

  // Magical Status
  cursed: {
    id: 'cursed',
    label: 'DASU.Status.Cursed',
    icon: 'icons/svg/skull.svg',
    tint: '#4b0082',
    description: 'DASU.Status.Description.Cursed',
  },
  empowered: {
    id: 'empowered',
    label: 'DASU.Status.Empowered',
    icon: 'icons/svg/upgrade.svg',
    tint: '#00ff00',
    description: 'DASU.Status.Description.Empowered',
  },
  focused: {
    id: 'focused',
    label: 'DASU.Status.Focused',
    icon: 'icons/svg/target.svg',
    tint: '#00aaff',
    description: 'DASU.Status.Description.Focused',
  },
  unraveled: {
    id: 'unraveled',
    label: 'DASU.Status.Unraveled',
    icon: 'icons/svg/chaos.svg',
    tint: '#ff1493',
    description: 'DASU.Status.Description.Unraveled',
  },

  // Sensory Status
  invisible: {
    id: 'invisible',
    label: 'DASU.Status.Invisible',
    icon: 'icons/svg/invisible.svg',
    tint: '#ffffff',
    description: 'DASU.Status.Description.Invisible',
  },
  silenced: {
    id: 'silenced',
    label: 'DASU.Status.Silenced',
    icon: 'icons/svg/silence.svg',
    tint: '#696969',
    description: 'DASU.Status.Description.Silenced',
  },

  // Health Status
  infected: {
    id: 'infected',
    label: 'DASU.Status.Infected',
    icon: 'icons/svg/disease.svg',
    tint: '#228b22',
    description: 'DASU.Status.Description.Infected',
  },

  // Combat Status
  guarded: {
    id: 'guarded',
    label: 'DASU.Status.Guarded',
    icon: 'icons/svg/shield.svg',
    tint: '#4169e1',
    description: 'DASU.Status.Description.Guarded',
  },
  unguarded: {
    id: 'unguarded',
    label: 'DASU.Status.Unguarded',
    icon: 'icons/svg/vulnerable.svg',
    tint: '#ff4500',
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
      label: status.label,
      icon: status.icon,
      tint: status.tint,
      description: status.description,
    })
  );
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
 * Get localized label for a status condition
 * @param {string} id - The status condition ID
 * @returns {string} The localized label or empty string if not found
 */
export function getStatusLabel(id) {
  const status = DASU_STATUS_CONDITIONS[id];
  if (!status) return '';

  return game.i18n.localize(status.label);
}
