import { PipelineMessage } from './pipeline-message.mjs';
import { PipelineButton } from './pipeline-button.mjs';
import { StubPipeline } from './stub-pipeline.mjs';

export { Pipeline } from './pipeline.mjs';
export { PipelineState } from './pipeline-state.mjs';
export { TargetResolver } from './target-resolver.mjs';
export { PipelineMessage } from './pipeline-message.mjs';
export { PipelineButton } from './pipeline-button.mjs';

/**
 * Pipelines available in the system. Each instance is registered for both
 * source-card button routing and result-message undo/redo routing.
 */
const PIPELINES = [new StubPipeline()];

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
