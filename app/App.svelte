<script lang="ts">
	import {
		Editor,
		getSchema,
		suggestionsPlugin,
		setSuggestionMode,
		type SuggestionMode,
		type Author,
		type AuthorInfo
	} from '../src/lib';
	import { Base, Button } from '@hyvor/design/components';

	let editor: Editor;

	let editable = $state(true);

	const schema = getSchema();

	const currentAuthor: Author = 'user:demo-user';

	// stands in for the host app's own identity lookup (a real app would call
	// its API/user directory here) - suggestions and comments only ever store
	// this raw author id in the document, never a display name/picture
	function resolveAuthor(author: Author): AuthorInfo {
		if (author === 'ai') return { name: 'AI' };
		if (author === currentAuthor) return { name: 'Demo User' };
		return { name: author };
	}

	// lets the demo page exercise "suggesting" mode (edits get wrapped in the
	// suggestion mark instead of applied directly, reviewable via the floating
	// suggestions panel) against the same editor/document used for everything
	// else on this page, rather than only being testable through the separate
	// diff demo
	let suggestionMode: SuggestionMode = $state('editing');
	const editorSuggestionsPlugin = suggestionsPlugin({
		author: currentAuthor,
		mode: suggestionMode,
		resolveAuthor
	});

	function setMode(newMode: SuggestionMode) {
		suggestionMode = newMode;
		const view = editor?.getView();
		if (view) setSuggestionMode(view, newMode);
	}

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
			plugins={[editorSuggestionsPlugin]}
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
