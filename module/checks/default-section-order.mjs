/**
 * Ordering for standardized chat-message sections. Sections contributed by
 * render hooks are sorted ascending, so lower numbers appear higher up.
 * @type {Readonly<Object<string, number>>}
 */
export const ChatSectionOrder = Object.freeze({
  flavor: Number.NaN,
  tags: -3000,
  addendum: -2500,
  reroll: -1100,
  push: -1200,
  roll: -1000,
  result: 1000,
  details: 1500,
  actions: 2000,
});

export const CHECK_DETAILS = ChatSectionOrder.details;
export const CHECK_ROLL = ChatSectionOrder.roll;
export const CHECK_RESULT = ChatSectionOrder.result;
