export { default as Editor } from './Editor.svelte';
export { diffDoc, buildDiffDoc } from './diff';
export type { Diff, InlineOp } from './diff';
export { getSchema } from './schema';
export type { SchemaConfig, EditorConfig } from './config';