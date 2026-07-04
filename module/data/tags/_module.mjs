import BaseTag from './base-tag.mjs';

export const TAG_TYPES = [BaseTag];

for (const cls of TAG_TYPES) BaseTag.registerType(cls);

export { BaseTag };
