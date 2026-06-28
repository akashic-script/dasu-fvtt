import { PipelineMessage } from './pipeline-message.mjs';
import { PipelineButton } from './pipeline-button.mjs';
import { DamagePipeline } from './damage-pipeline.mjs';
import { ResourcePipeline } from './resource-pipeline.mjs';
import { EffectPipeline } from './effect-pipeline.mjs';

export { Pipeline } from './pipeline.mjs';
export { PipelineState } from './pipeline-state.mjs';
export { TargetResolver } from './target-resolver.mjs';
export { PipelineMessage } from './pipeline-message.mjs';
export { PipelineButton } from './pipeline-button.mjs';

/**
 * Pipelines available in the system. Each instance is registered for both
 * source-card button routing and result-message undo/redo routing.
 */
const PIPELINES = [
  new DamagePipeline(),
  new ResourcePipeline(),
  new EffectPipeline(),
];

/** Look up a registered pipeline instance by its static type. */
export function getPipeline(type) {
  return PIPELINES.find((p) => p.constructor.type === type) ?? null;
}

/**
 * Register pipelines and wire the chat hooks. Call once during init.
 */
export function initializePipelines() {
  for (const pipeline of PIPELINES) {
    PipelineButton.register(pipeline);
    PipelineMessage.register(pipeline);
  }

  Hooks.on('renderChatMessageHTML', (message, html) => {
    PipelineButton.inject(message, html);
    PipelineMessage.activate(message, html);
  });
}
