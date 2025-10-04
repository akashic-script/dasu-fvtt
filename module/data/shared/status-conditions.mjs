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
    duration: {
      turns: 3,
    },
    flags: {
      dasu: {
        stackable: true,
        stackId: 'bleeding',
        maxStacks: null,
        currentStacks: 1,
        stackMode: 'ADD',
        showStackCount: true,
      },
    },
  },
  stunned: {
    id: 'stunned',
    name: 'DASU.Status.Stunned',
    img: 'icons/svg/daze.svg',
    tint: '#d4a870',
    description: 'DASU.Status.Description.Stunned',
    duration: {
      turns: 1,
    },
  },
  sleep: {
    id: 'sleep',
    name: 'DASU.Status.Sleep',
    img: 'icons/svg/sleep.svg',
    tint: '#8bb5d0',
    description: 'DASU.Status.Description.Sleep',
    duration: {
      turns: 3,
    },
  },
  restrained: {
    id: 'restrained',
    name: 'DASU.Status.Restrained',
    img: 'icons/svg/net.svg',
    tint: '#805555',
    description: 'DASU.Status.Description.Restrained',
    duration: {
      turns: 3,
    },
    changes: [
      {
        key: 'system.stats.toHit.mod',
        mode: 2, // ADD
        value: '-@origin.system.attributes.dex.tick',
        priority: 20,
      },
      {
        key: 'system.stats.avoid.mod',
        mode: 2, // ADD
        value: '-@origin.system.attributes.dex.tick',
        priority: 20,
      },
    ],
  },

  // Mental Status
  charmed: {
    id: 'charmed',
    name: 'DASU.Status.Charmed',
    img: 'icons/svg/stoned.svg',
    tint: '#d080a0',
    description: 'DASU.Status.Description.Charmed',
    duration: {
      turns: 3,
    },
  },
  dazed: {
    id: 'dazed',
    name: 'DASU.Status.Dazed',
    img: 'icons/svg/daze.svg',
    tint: '#d0bd80',
    description: 'DASU.Status.Description.Dazed',
    duration: {
      turns: 3,
    },
    changes: [
      {
        key: 'system.stats.toHit.mod',
        mode: 2, // ADD
        value: '-@origin.system.attributes.will.tick',
        priority: 20,
      },
    ],
  },
  despair: {
    id: 'despair',
    name: 'DASU.Status.Despair',
    img: 'icons/svg/falling.svg',
    tint: '#7560a0',
    description: 'DASU.Status.Description.Despair',
    duration: {
      turns: 3,
    },
  },
  rage: {
    id: 'rage',
    name: 'DASU.Status.Rage',
    img: 'icons/svg/terror.svg',
    tint: '#a06666',
    description: 'DASU.Status.Description.Rage',
    duration: {
      turns: 3,
    },
  },

  // Magical Status
  cursed: {
    id: 'cursed',
    name: 'DASU.Status.Cursed',
    img: 'icons/svg/skull.svg',
    tint: '#806088',
    description: 'DASU.Status.Description.Cursed',
    // Cursed lasts until the end of conflict/encounter, not a fixed number of turns
    // Special effect: Doubles the length of other status effects
    duration: {},
    flags: {
      dasu: {
        specialDuration: 'removeOnCombatEnd',
      },
    },
  },
  empowered: {
    id: 'empowered',
    name: 'DASU.Status.Empowered',
    img: 'icons/svg/upgrade.svg',
    tint: '#70a070',
    description: 'DASU.Status.Description.Empowered',
    duration: {
      turns: 3,
    },
    changes: [
      {
        key: 'system.attributes.pow.tick',
        mode: 2, // ADD
        value: '@origin.system.attributes.will.tick',
        priority: 20,
      },
    ],
  },
  focused: {
    id: 'focused',
    name: 'DASU.Status.Focused',
    img: 'icons/svg/target.svg',
    tint: '#7090c0',
    description: 'DASU.Status.Description.Focused',
    duration: {
      turns: 3,
    },
    changes: [
      {
        key: 'system.stats.toHit.mod',
        mode: 2, // ADD
        value: '@origin.system.attributes.will.tick',
        priority: 20,
      },
    ],
  },
  unraveled: {
    id: 'unraveled',
    name: 'DASU.Status.Unraveled',
    img: 'icons/svg/lever.svg',
    tint: '#c0709a',
    description: 'DASU.Status.Description.Unraveled',
    duration: {
      turns: 3,
    },
    changes: [
      {
        key: 'system.resistances.physical.method',
        mode: 0, // CUSTOM
        value: 'downgrade',
        priority: 20,
      },
      {
        key: 'system.resistances.fire.method',
        mode: 0, // CUSTOM
        value: 'downgrade',
        priority: 20,
      },
      {
        key: 'system.resistances.ice.method',
        mode: 0, // CUSTOM
        value: 'downgrade',
        priority: 20,
      },
      {
        key: 'system.resistances.electric.method',
        mode: 0, // CUSTOM
        value: 'downgrade',
        priority: 20,
      },
      {
        key: 'system.resistances.wind.method',
        mode: 0, // CUSTOM
        value: 'downgrade',
        priority: 20,
      },
      {
        key: 'system.resistances.earth.method',
        mode: 0, // CUSTOM
        value: 'downgrade',
        priority: 20,
      },
      {
        key: 'system.resistances.light.method',
        mode: 0, // CUSTOM
        value: 'downgrade',
        priority: 20,
      },
      {
        key: 'system.resistances.dark.method',
        mode: 0, // CUSTOM
        value: 'downgrade',
        priority: 20,
      },
    ],
  },

  // Sensory Status
  invisible: {
    id: 'invisible',
    name: 'DASU.Status.Invisible',
    img: 'icons/svg/invisible.svg',
    tint: '#b0b0b0',
    description: 'DASU.Status.Description.Invisible',
    duration: {
      turns: 3,
    },
    changes: [
      {
        key: 'system.stats.avoid.mod',
        mode: 2, // ADD
        value: '@origin.system.attributes.dex.tick',
        priority: 20,
      },
    ],
  },
  silenced: {
    id: 'silenced',
    name: 'DASU.Status.Silenced',
    img: 'icons/svg/silenced.svg',
    tint: '#909090',
    description: 'DASU.Status.Description.Silenced',
    duration: {
      turns: 3,
    },
  },

  // Health Status
  infected: {
    id: 'infected',
    name: 'DASU.Status.Infected',
    img: 'icons/svg/poison.svg',
    tint: '#80a080',
    description: 'DASU.Status.Description.Infected',
    duration: {
      turns: 3,
    },
    flags: {
      dasu: {
        stackable: true,
        stackId: 'infected',
        maxStacks: null,
        currentStacks: 1,
        stackMode: 'ADD',
        showStackCount: true,
      },
    },
  },

  // Negotiation Status
  guarded: {
    id: 'guarded',
    name: 'DASU.Status.Guarded',
    img: 'icons/svg/shield.svg',
    tint: '#7080c0',
    description: 'DASU.Status.Description.Guarded',
    duration: {
      turns: 3,
    },
    changes: [
      {
        key: 'system.stats.def.mod',
        mode: 2, // ADD
        value: '@origin.system.level * 2',
        priority: 20,
      },
    ],
  },
  unguarded: {
    id: 'unguarded',
    name: 'DASU.Status.Unguarded',
    img: 'icons/svg/mage-shield.svg',
    tint: '#d0906a',
    description: 'DASU.Status.Description.Unguarded',
    duration: {
      turns: 3,
    },
    changes: [
      {
        key: 'system.stats.def.mod',
        mode: 2, // ADD
        value: '-@origin.system.level * 2',
        priority: 20,
      },
    ],
  },
};

/**
 * Register custom status conditions with Foundry
 */
export function registerStatusConditions() {
  // Set status effects as an array for Foundry V13+
  CONFIG.statusEffects = Object.values(DASU_STATUS_CONDITIONS).map((status) => {
    const statusEffect = {
      id: status.id,
      name: status.name,
      img: status.img,
      tint: status.tint,
      description: game.i18n.localize(status.description),
      flags: status.flags || {},
    };

    // Add duration if it exists
    if (status.duration) {
      statusEffect.duration = status.duration;
    }

    // Add changes if they exist
    if (status.changes) {
      statusEffect.changes = status.changes;
    }

    return statusEffect;
  });

  console.log('DASU | Registered status effects:', CONFIG.statusEffects);

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
