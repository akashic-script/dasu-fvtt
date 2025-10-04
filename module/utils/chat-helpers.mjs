/**
 * Chat message utility functions
 */

/**
 * Updates a chat message to indicate it has been edited by:
 * - Adding strikethrough styling to the primary content
 * - Disabling action buttons
 * - Adding an "edited" indicator
 *
 * @param {string} messageId - The ID of the message to update
 * @param {string} contentSelector - CSS selector for the main content to strikethrough (e.g., '.damage-text', '.healing-text')
 * @param {string} buttonSelector - CSS selector for buttons to disable (e.g., '.damage-action-btn', '.healing-action-btn')
 * @param {string} containerSelector - CSS selector for container to append indicator (e.g., '.damage-applied-content', '.healing-applied-content')
 * @param {string} editType - Type of edit for the indicator text (e.g., 'damage', 'healing')
 * @returns {Promise<void>}
 */
export async function markMessageAsEdited(
  messageId,
  contentSelector,
  buttonSelector,
  containerSelector,
  editType
) {
  const message = game.messages.get(messageId);
  if (!message) return;

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = message.content;

  // Add strikethrough to main content
  const contentElement = tempDiv.querySelector(contentSelector);
  if (contentElement) {
    contentElement.classList.add('edited-content');
  }

  // Disable action buttons
  const buttons = tempDiv.querySelectorAll(buttonSelector);
  buttons.forEach((button) => {
    button.disabled = true;
    button.classList.add('disabled-button');
  });

  // Add "edited" indicator if not already present
  const container = tempDiv.querySelector(containerSelector);
  if (container && !tempDiv.querySelector('.edited-indicator')) {
    const editedIndicator = document.createElement('div');
    editedIndicator.className = 'edited-indicator';
    editedIndicator.textContent = `(Edited - see revised ${editType} below)`;
    container.appendChild(editedIndicator);
  }

  await message.update({ content: tempDiv.innerHTML });
}
