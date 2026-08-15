export { default as Editor } from './Editor.svelte';
export { diffDoc, buildDiffDoc } from './diff';
export type { Diff, InlineOp } from './diff';
export { getSchema } from './schema';
export type { SchemaConfig, EditorConfig } from './config';

export { default as suggestionsPlugin } from './plugins/suggestions/plugin-suggestions';
export type {
	SuggestionMode,
	SuggestionSubtype,
	SuggestionsPluginConfig,
	Author,
	AuthorInfo,
	SuggestionReply
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
	resolveComment
} from './plugins/suggestions/commands';