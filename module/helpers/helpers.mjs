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
  Handlebars.registerHelper('gte', (a, b) => a >= b);
  Handlebars.registerHelper('lte', (a, b) => a <= b);
  Handlebars.registerHelper('decrement', (a) => a - 1);

  // toNumber helper for numeric comparisons
  Handlebars.registerHelper('toNumber', function (value) {
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
}
