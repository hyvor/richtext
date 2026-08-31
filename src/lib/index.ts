export { default as Editor } from './Editor.svelte';
export { diffDoc, buildDiffDoc } from './diff';
export type { Diff, InlineOp, DiffSuggestionRef } from './diff';
export { getSchema } from './schema';
export type { SchemaConfig, EditorConfig, UploadFileConfig } from './config';

export type {
	SuggestionMode,
	SuggestionSubtype,
	SuggestionsPluginConfig,
	Author,
	AuthorInfo,
	SuggestionReply,
	SuggestionSource,
	SuggestionSourceEntry,
	SuggestionEvent
} from './plugins/suggestions/plugin-suggestions';
export type { SuggestionItem } from './plugins/suggestions/commands';

export type {
	CollabPluginConfig,
	CollabSendable,
	CollabStepJSON,
	CollabClientID
} from './plugins/collab/plugin-collab';

export type {
	CursorsPluginConfig,
	RemoteCursor,
	RemoteCursorUser
} from './plugins/cursors/plugin-cursors';