<script lang="ts">
	import {
		Editor,
		getSchema,
		suggestionsPlugin,
		setSuggestionMode,
		type SuggestionMode,
		commentsPlugin,
		type Comment
	} from '../src/lib';
	import { Base, Button } from '@hyvor/design/components';

	let editor: Editor;

	let editable = $state(true);

	const schema = getSchema();

	// lets the demo page exercise "suggesting" mode (edits get wrapped in the
	// suggestion mark instead of applied directly, reviewable via the floating
	// suggestions panel) against the same editor/document used for everything
	// else on this page, rather than only being testable through the separate
	// diff demo
	let suggestionMode: SuggestionMode = $state('editing');
	const editorSuggestionsPlugin = suggestionsPlugin({
		user: { id: 'demo-user', name: 'Demo User' },
		mode: suggestionMode
	});

	function setMode(newMode: SuggestionMode) {
		suggestionMode = newMode;
		const view = editor?.getView();
		if (view) setSuggestionMode(view, newMode);
	}

	// stands in for the host app's own comment store (a real app would call
	// its API here) - persisted in localStorage the same way `doc` already
	// is below, so comments survive a reload just like the document does.
	// The editor never sees this directly: it only round-trips thread ids
	// through the doc, and reaches comment text/authors through these
	// getComments/onAdd/onReply/onResolve callbacks.
	function loadComments(): Comment[] {
		try {
			return JSON.parse(localStorage.getItem('comments') ?? '[]');
		} catch {
			return [];
		}
	}
	function saveComments(comments: Comment[]) {
		localStorage.setItem('comments', JSON.stringify(comments));
	}

	const editorCommentsPlugin = commentsPlugin({
		user: { id: 'demo-user', name: 'Demo User' },
		getComments: () => loadComments(),
		onAdd: (comment) => saveComments([...loadComments(), comment]),
		onReply: (reply) => saveComments([...loadComments(), reply]),
		onResolve: (commentId) => saveComments(loadComments().filter((c) => c.commentId !== commentId))
	});

	function setContent() {
		editor.setContent(JSON.stringify({
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [
						{
							type: 'text',
							text: 'This is a new content set programmatically.'
						}
					]
				}
			]
		}));
	}
</script>

<Base>
	<div class="container">
		<Editor
			bind:this={editor}
			value={localStorage.getItem('doc')}
			onvaluechange={(val) => localStorage.setItem('doc', val)}
			{schema}
			plugins={[editorSuggestionsPlugin, editorCommentsPlugin]}
			editorConfig={{
				codeBlockConfig: {
					language: true,
					annotations: true,
					annotationsUrl: null,
					fileName: true,
				},
				colorButtonBackground: '#585895',
				fileUploader: async (blob, name, type) => {
					return {
						url: URL.createObjectURL(blob)
					};
				}
			}}
		/>
	</div>
</Base>

<div class="focus">
	<button onclick={() => editor.focus()}>Focus</button>
	<button onclick={setContent}>Set content</button>
	<button onclick={() => {
		editable = !editable;
		editor.setEditable(editable);
	}}>
		{editable ? 'Set Readonly' : 'Set Editable'}
	</button>
	<div class="suggestion-mode-switch">
		<Button
			size="x-small"
			color={suggestionMode === 'editing' ? 'accent' : 'gray'}
			onclick={() => setMode('editing')}
		>
			Editing
		</Button>
		<Button
			size="x-small"
			color={suggestionMode === 'suggesting' ? 'accent' : 'gray'}
			onclick={() => setMode('suggesting')}
		>
			Suggesting
		</Button>
	</div>
</div>

<style>
	.container {
		margin: 60px auto;
		min-height: 600px;
		width: 650px;
		background-color: #fff;
		border: 1px solid #ccc;
		border-radius: 20px;
	}
	.focus {
		margin: 20px auto;
		width: 650px;
		text-align: center;
	}
	.suggestion-mode-switch {
		display: inline-flex;
		gap: 4px;
		margin-left: 8px;
		vertical-align: middle;
	}
</style>
