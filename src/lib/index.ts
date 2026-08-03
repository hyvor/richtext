export { default as Editor } from './Editor.svelte';

export type { SuggestionMode, SuggestionUser } from './plugins/suggestions/plugin-suggestions';
export type { SuggestionItem } from './plugins/suggestions/commands';
export {
	getSuggestionMode,
	getSuggestionUser,
	setSuggestionMode,
	setSuggestionUser,
	getSuggestions,
	acceptSuggestion,
	rejectSuggestion,
	acceptAllSuggestions,
	rejectAllSuggestions
} from './plugins/suggestions/commands';