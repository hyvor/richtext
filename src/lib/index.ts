export { default as Editor } from './Editor.svelte';
export { diffDoc, buildDiffDoc } from './diff';
export type { Diff, InlineOp } from './diff';
export { getSchema } from './schema';
export type { SchemaConfig, EditorConfig } from './config';

export { default as suggestionsPlugin } from './plugins/suggestions/plugin-suggestions';
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

export { default as commentsPlugin } from './plugins/comments/plugin-comments';
export type { Comment, CommentUser, CommentsPluginConfig } from './plugins/comments/plugin-comments';
export type { CommentThread } from './plugins/comments/commands';
export {
	getCommentThreads,
	getComments,
	getCommentUser,
	refreshComments,
	addComment,
	replyToComment,
	resolveComment
} from './plugins/comments/commands';