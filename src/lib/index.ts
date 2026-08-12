export { default as Editor } from './Editor.svelte';
export { diffDoc, buildDiffDoc, diffDecorationsPlugin, renderDiff, flattenDiffChanges } from './diff';
export type { Diff, InlineOp, DiffDoc, DiffType, DiffChange, ChangeKind } from './diff';
export { getSchema } from './schema';
export type { SchemaConfig, EditorConfig } from './config';