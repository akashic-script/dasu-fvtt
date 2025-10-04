/**
 * DASU Effects System
 * Centralized effect application pipeline with extensibility hooks
 */

// Core processor
export { EffectProcessor } from './processor.mjs';

// Display utilities
export { prepareActiveEffectCategories } from './display.mjs';

// Token HUD integration
import { initializeTokenHudEffects as _initializeTokenHudEffects } from './token-hud.mjs';
export { initializeTokenHudEffects } from './token-hud.mjs';

// Enricher integration
import { registerEffectEnricher as _registerEffectEnricher } from './enricher.mjs';
export { registerEffectEnricher } from './enricher.mjs';

/**
 * Initialize the effects system
 * Sets up hooks and event listeners for runtime behavior
 * Note: Enricher registration happens separately in init hook
 */
export function initializeEffects() {
  // Initialize token HUD effects
  _initializeTokenHudEffects();
}
