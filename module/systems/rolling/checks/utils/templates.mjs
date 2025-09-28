/**
 * Template rendering utilities for Checks system
 */

export class TemplateUtils {
  /**
   * Render a template section
   */
  static async renderSection(section) {
    if (typeof section === 'string') {
      return section;
    }

    if (typeof section === 'function') {
      return await this.renderSection(section());
    }

    if (section instanceof Promise) {
      return await this.renderSection(await section);
    }

    if (section.content) {
      return section.content;
    }

    if (section.partial && section.data) {
      try {
        return await foundry.applications.handlebars.renderTemplate(
          section.partial,
          section.data
        );
      } catch (error) {
        console.error(
          `Checks | Error rendering template ${section.partial}:`,
          error
        );
        return `<!-- Template error: ${section.partial} -->`;
      }
    }

    console.warn('Checks | Invalid section format:', section);
    return '';
  }

  /**
   * Get success level description for dice pool results
   */
  static getSuccessLevel(successes) {
    if (successes === 0) return 'failure';
    if (successes === 1) return 'partial';
    if (successes === 2) return 'success';
    if (successes >= 3) return 'critical';
    return 'success';
  }

  /**
   * Get CSS class for result styling
   */
  static getResultClass(successes, isCritical = false) {
    if (isCritical) return 'critical-success';
    if (successes === 0) return 'failure';
    if (successes === 1) return 'partial-success';
    if (successes === 2) return 'success';
    if (successes >= 3) return 'critical-success';
    return 'success';
  }

  /**
   * Format modifier display
   */
  static formatModifiers(modifiers) {
    if (!modifiers || modifiers.length === 0) return '';

    return modifiers
      .map((mod) => {
        const sign = mod.value >= 0 ? '+' : '';
        return `${mod.label}: ${sign}${mod.value}`;
      })
      .join(', ');
  }

  /**
   * Get advantage state display text
   */
  static getAdvantageText(advantageState) {
    switch (advantageState) {
      case 'advantage':
        return 'Advantage';
      case 'disadvantage':
        return 'Disadvantage';
      default:
        return 'Normal';
    }
  }
}
