import { InlineHelper } from '../helpers/inline/inline-helper.mjs';
import { InlineDispatch } from '../helpers/inline/inline-dispatch.mjs';
import { InlineDamage } from './inline-damage.mjs';
import { InlineResource } from './inline-resource.mjs';
import { InlineEffect } from './inline-effect.mjs';
import { initializeInlineBuilder } from './inline-builder.mjs';

const COMMANDS = [InlineDamage, InlineResource, InlineEffect];

/** Register inline enrichers, request-card renderer, and toolbar builder. */
export function initializeInlineEnrichers() {
  for (const command of COMMANDS) InlineHelper.registerCommand(command);
  InlineDispatch.initialize();
  initializeInlineBuilder();
}
