// Register all Handlebars helpers for the DASU system
export function registerHandlebarsHelpers() {
  Handlebars.registerHelper('includes', function (array, value) {
    if (!array || !Array.isArray(array)) return false;
    return array.includes(value);
  });

  Handlebars.registerHelper('isTagEquipped', function (tag, actor) {
    if (!actor || !tag) return false;
    const equippedWeapons = actor.items.filter(
      (item) => item.type === 'weapon'
    );
    return equippedWeapons.some((weapon) => {
      const tagSlots = weapon.system.tagSlots || {};
      return Object.values(tagSlots).some((slot) => slot.tagId === tag._id);
    });
  });

  // Math helpers
  Handlebars.registerHelper('add', (a, b) => a + b);
  Handlebars.registerHelper('subtract', (a, b) => a - b);
  Handlebars.registerHelper('multiply', (a, b) => a * b);
  Handlebars.registerHelper('divide', (a, b) => a / b);
  Handlebars.registerHelper('gt', (a, b) => a > b);
  Handlebars.registerHelper('lt', (a, b) => a < b);
  Handlebars.registerHelper('eq', (a, b) => a === b);
  Handlebars.registerHelper('neq', (a, b) => a !== b);
  Handlebars.registerHelper('gte', (a, b) => a >= b);
  Handlebars.registerHelper('lte', (a, b) => a <= b);
  Handlebars.registerHelper('decrement', (a) => a - 1);

  // Skill helpers
  Handlebars.registerHelper('findSkillTicks', function (skills, skillName) {
    if (!skills || !Array.isArray(skills) || !skillName) return 0;
    const skill = skills.find((s) => s.name === skillName);
    return skill ? skill.ticks || 0 : 0;
  });

  // Get skill ticks at the start of a specific level
  Handlebars.registerHelper(
    'getBaseSkillTicks',
    function (actor, skillName, level) {
      if (!actor || !skillName) return 0;

      // Find the skill and get its base value
      const skills = actor.system.skills || [];
      const skill = skills.find(
        (s) => s.name === skillName || s.id === skillName
      );
      let baseTicks = skill ? skill.base || 0 : 0;

      // Add allocations from all previous levels
      const pointAllocations =
        actor.system.levelingData?.pointAllocations || {};
      for (let prevLevel = 1; prevLevel < level; prevLevel++) {
        const prevLevelAllocation =
          pointAllocations[prevLevel]?.sp?.skills?.[skillName] || 0;
        baseTicks += prevLevelAllocation;
      }

      return baseTicks;
    }
  );

  // Attribute helpers
  Handlebars.registerHelper(
    'getAttributeTicks',
    function (attributes, attrName) {
      if (!attributes || !attrName) return 1;
      const attr = attributes[attrName];
      return attr ? attr.tick || 1 : 1;
    }
  );

  // Check if attribute name is valid
  Handlebars.registerHelper('isValidAttribute', function (attrName) {
    const validAttributes = ['pow', 'dex', 'will', 'sta'];
    return validAttributes.includes(attrName);
  });

  // Get current allocation for an attribute at a specific level
  Handlebars.registerHelper(
    'getCurrentAllocation',
    function (pointAllocations, pointType, target) {
      if (!pointAllocations || !pointType || !target) return 0;

      if (pointType === 'ap') {
        return pointAllocations.ap?.[target] || 0;
      } else if (pointType === 'sp') {
        return pointAllocations.sp?.skills?.[target] || 0;
      }

      return 0;
    }
  );

  // Get attribute ticks at the start of a specific level
  Handlebars.registerHelper(
    'getBaseAttributeTicks',
    function (actor, attrName, level) {
      if (!actor || !attrName) return 1;

      // Get class starting attributes or default to 1
      const classData = actor.system.getClassData?.() || {};
      const startingAttributes = classData.startingAttributes || {};
      let baseTicks = startingAttributes[attrName] || 1;

      // Add allocations from all previous levels
      const pointAllocations =
        actor.system.levelingData?.pointAllocations || {};
      for (let prevLevel = 1; prevLevel < level; prevLevel++) {
        const prevLevelAllocation =
          pointAllocations[prevLevel]?.ap?.[attrName] || 0;
        baseTicks += prevLevelAllocation;
      }

      return baseTicks;
    }
  );

  // toNumber helper for numeric comparisons
  Handlebars.registerHelper('toNumber', function (value) {
    if (value === null || value === undefined || value === '') return null;
    return Number(value);
  });

  // Percent helper for bar meters
  Handlebars.registerHelper('percent', function (current, max) {
    if (!max || isNaN(current) || isNaN(max)) return 0;
    return Math.max(0, Math.min(100, (current / max) * 100));
  });

  // Generic helper to ensure an array is a given length, filling with default values
  Handlebars.registerHelper(
    'ensureArrayLength',
    function (array, length, defaultValue) {
      const arr = Array.isArray(array) ? array.slice() : [];
      for (let i = 0; i < length; i++) {
        if (!arr[i]) arr[i] = defaultValue || {};
      }
      return arr;
    }
  );

  // String manipulation helpers
  Handlebars.registerHelper('toLowerCase', function (str) {
    if (!str) return '';
    return str.toLowerCase();
  });

  Handlebars.registerHelper('uppercase', function (str) {
    if (!str) return '';
    return str.toUpperCase();
  });

  Handlebars.registerHelper('capitalize', function (str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  });

  // Range helper for creating arrays of numbers
  Handlebars.registerHelper('range', function (start, end) {
    const result = [];
    for (let i = start; i <= end; i++) {
      result.push(i);
    }
    return result;
  });

  // Localize aptitude type to short form
  Handlebars.registerHelper('localizeAptitudeTypeShort', function (type) {
    if (!type) return '';
    return game.i18n.localize(`DASU.aptitudeTypes.${type}.short`);
  });

  // Localize aptitude type to long form
  Handlebars.registerHelper('localizeAptitudeTypeLong', function (type) {
    if (!type) return '';
    return game.i18n.localize(`DASU.aptitudeTypes.${type}.long`);
  });

  // Alias for uppercase for template compatibility
  Handlebars.registerHelper('upper', function (str) {
    if (!str) return '';
    return str.toUpperCase();
  });

  // Lowercase helper
  Handlebars.registerHelper('lower', function (str) {
    if (!str) return '';
    return str.toLowerCase();
  });

  // Format timestamp for display
  Handlebars.registerHelper('formatTime', function (timestamp) {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString();
    } catch (e) {
      return '';
    }
  });

  // Array join helper for joining arrays with a separator
  Handlebars.registerHelper('arrayJoin', function (array, separator) {
    if (!Array.isArray(array)) return '';
    return array.join(separator || ',');
  });

  // String conversion helper for template comparisons
  Handlebars.registerHelper('toString', function (value) {
    if (value === null || value === undefined) return '';
    return String(value);
  });

  // Get upgradeable slots for schema bonuses
  Handlebars.registerHelper(
    'getUpgradeableSlots',
    function (levelSlots, slotType, currentLevel) {
      if (!levelSlots || !slotType || !currentLevel) return [];

      const upgradeableSlots = [];

      // Look through all levels below the current one
      for (let level = 1; level < currentLevel; level++) {
        const slots = levelSlots[level];
        if (!slots || !Array.isArray(slots)) continue;

        slots.forEach((slot, index) => {
          // Only include schema slots of the same type that are set to "new"
          if (
            slot.type === slotType &&
            slot.action === 'new' &&
            slot.schemaId
          ) {
            upgradeableSlots.push({
              id: `${level}-${index}`,
              level: level,
              name: slot.schemaId || `Slot ${index + 1}`,
              slotIndex: index,
            });
          }
        });
      }

      return upgradeableSlots;
    }
  );

  // Get all schema slots of a specific type for upgrade selection
  Handlebars.registerHelper(
    'getAllSchemaSlots',
    function (levelSlots, slotType) {
      if (!levelSlots || !slotType) return [];

      const allSlots = [];

      // Look through all levels
      for (let level = 1; level <= 30; level++) {
        const slots = levelSlots[level];
        if (!slots || !Array.isArray(slots)) continue;

        slots.forEach((slot, index) => {
          // Include schema slots of the same type that are set to "new" and have slot numbers
          if (
            slot.type === slotType &&
            slot.action === 'new' &&
            slot.slotNumber
          ) {
            allSlots.push({
              id: `${level}-${index}`,
              level: level,
              slotNumber: slot.slotNumber,
              name: slot.schemaId || `Schema ${slot.slotNumber}`,
              slotIndex: index,
            });
          }
        });
      }

      return allSlots;
    }
  );

  // Get available slot numbers for upgrade selection
  Handlebars.registerHelper(
    'getAvailableSlotNumbers',
    function (levelSlots, slotType, currentLevel) {
      if (!levelSlots || !slotType || !currentLevel) return [];

      const usedSlotNumbers = new Set();

      // Look through all levels below current level to find existing slot numbers
      for (let level = 1; level < currentLevel; level++) {
        const slots = levelSlots[level];
        if (!slots || !Array.isArray(slots)) continue;

        slots.forEach((slot, index) => {
          // For schema slots, look for enhanced slot structure
          if (typeof slot === 'object' && slot.type === slotType) {
            // Check if it has a slot number and is either "new" action or no action set
            if (slot.slotNumber && (!slot.action || slot.action === 'new')) {
              usedSlotNumbers.add(parseInt(slot.slotNumber));
            }
          }
        });
      }

      // Return array of available slot numbers (convert Set to sorted Array)
      return Array.from(usedSlotNumbers).sort((a, b) => a - b);
    }
  );
}
