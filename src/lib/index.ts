export { default as Editor } from './Editor.svelte';
export { diffDoc, buildDiffDoc } from './diff';
export type { Diff, InlineOp, DiffSuggestionRef } from './diff';
export { getSchema } from './schema';
export type { SchemaConfig, EditorConfig } from './config';

export { default as suggestionsPlugin } from './plugins/suggestions/plugin-suggestions';
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
export {
	getSuggestionMode,
	setSuggestionMode,
	getCurrentAuthor,
	setCurrentAuthor,
	getSuggestions,
	acceptSuggestion,
	rejectSuggestion,
	acceptAllSuggestions,
	rejectAllSuggestions,
	addComment,
	replyToSuggestion,
	resolveComment,
	seedSuggestionSource
} from './plugins/suggestions/commands';