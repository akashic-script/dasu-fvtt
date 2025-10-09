/**
 * @fileoverview Skill Manager Dialog
 * DialogV2 for managing skill modifier and specialties.
 * Provides an interface for editing skill settings.
 */

/* global */

/**
 * Skill Manager Dialog class
 * Manages skill modifier and specialties for actors through an interactive DialogV2 interface.
 *
 * Features:
 * - Edit skill modifier
 * - Edit skill specialties text
 *
 * @example
 * // Open the skill manager for an actor
 * await SkillManagerDialog.open(actor, 0); // skillIndex
 */
export class SkillManagerDialog {
  /**
   * Processes form data and applies updates to the actor
   * @private
   * @param {Actor} actor - The actor to update
   * @param {number} skillIndex - Index of the skill in the skills array
   * @param {Object} formData - Form data object
   * @returns {Promise<void>}
   */
  static async _applyFormData(actor, skillIndex, formData) {
    // Get current skills array
    const skills = foundry.utils.deepClone(actor.system.skills);

    if (!skills[skillIndex]) {
      ui.notifications.error('Invalid skill index');
      return;
    }

    // Update the specific skill
    skills[skillIndex].mod = Number(formData.mod) || 0;
    skills[skillIndex].specialties = formData.specialties?.trim() || '';

    // Update the entire skills array
    await actor.update({ 'system.skills': skills });

    const skillName = skills[skillIndex]?.name || 'Skill';
    ui.notifications.info(`${skillName} settings updated`);
  }

  /**
   * Opens the skill manager dialog for the specified actor and skill
   *
   * @param {Actor} actor - The actor to manage skill for
   * @param {number} skillIndex - Index of the skill in the skills array
   * @returns {Promise<void>}
   * @throws {Error} If actor is invalid or skill index is out of bounds
   */
  static async open(actor, skillIndex) {
    const skills = actor.system.skills || [];
    const skill = skills[skillIndex];

    if (!skill) {
      ui.notifications.error('Invalid skill index');
      return;
    }

    const content = await foundry.applications.handlebars.renderTemplate(
      'systems/dasu/templates/dialogs/skill-manager-dialog.hbs',
      {
        skill,
        skillIndex,
      }
    );

    const dialog = await foundry.applications.api.DialogV2.prompt({
      window: {
        title: game.i18n.format('DASU.SkillManager.Title', {
          name: skill.name,
        }),
        icon: 'fa-cog',
      },
      classes: ['dasu', 'skill-manager-dialog'],
      position: {
        width: 400,
      },
      content,
      rejectClose: false,
      modal: false,
      buttons: [
        {
          action: 'apply',
          label: game.i18n.localize('DASU.Apply'),
          icon: 'fa-check',
          default: true,
          callback: async (_event, _button, dialog) => {
            // Get form element from dialog
            const form = dialog.element.querySelector('form');
            if (!form) {
              console.warn('Skill Manager - Form not found in dialog');
              return { action: 'cancel' };
            }

            const formData = new foundry.applications.ux.FormDataExtended(form)
              .object;

            // Apply form data
            await this._applyFormData(actor, skillIndex, formData);

            return { action: 'apply' };
          },
        },
        {
          action: 'cancel',
          label: game.i18n.localize('DASU.Cancel'),
          icon: 'fa-times',
          callback: () => ({ action: 'cancel' }),
        },
      ],
      render: (_event, _dialog) => {
        // Add any event listeners if needed
      },
      close: () => null,
    });
  }
}
