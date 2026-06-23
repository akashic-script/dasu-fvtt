import { SYSTEM } from './config.mjs';

/**
 * Scoped flag keys used by documents (actors, chat messages) across the system.
 * @example actor.getFlag(Flags.Scope, Flags.Actor.Fieldsets)
 */
export const Flags = Object.freeze({
  Scope: SYSTEM,
  ChatMessage: Object.freeze({
    Check: 'Check',
    Item: 'Item',
  }),
  Actor: Object.freeze({
    Fieldsets: 'fieldsets',
    AdvancementChoices: 'advancementChoices',
  }),
  Item: Object.freeze({
    SlotAdvancementId: 'slotAdvancementId',
    SlotCopy: 'slotCopy',
  }),
  Toggle: Object.freeze({
    /** Per-actor crit threshold reduction sources, etc. can live here later. */
  }),
});
