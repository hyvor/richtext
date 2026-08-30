<script lang="ts">
	import {
		Editor,
		getSchema,
		type SuggestionMode,
		type Author,
		type AuthorInfo,
		type CollabSendable,
		type CollabStepJSON,
		type CollabClientID,
		type RemoteCursor
	} from '../src/lib';
	import { createDemoSuggestionSource } from './demoSuggestionSource';
	import { Base, Button } from '@hyvor/design/components';

	let editor: Editor;

	// populated from the collab server's 'init' reply below - the editor
	// isn't rendered until then, so it always starts from the server's
	// current (doc, version) instead of an empty/stale local guess
	let initialDoc: string | null = $state(null);
	let initialCollabVersion = $state(0);
	let ready = $state(false);

	function saveDoc(val: string) {
		if (!collabSocket || collabSocket.readyState !== WebSocket.OPEN) return;
		collabSocket.send(
			JSON.stringify({ type: 'save', doc: JSON.parse(val), version: editor?.collab.getVersion() ?? 0 })
		);
	}

	// identifies this tab for both collab steps (CollabPluginConfig.clientID)
	// and cursor presence (RemoteCursor.clientId) - see plugin-cursors.ts
	const collabClientID: CollabClientID = Math.random().toString(36).slice(2);
	// a stand-in for whatever identity/color a real host would attach - see
	// resolveAuthor above for the same idea applied to suggestions/comments
	const collabUser = {
		name: 'User ' + collabClientID.slice(0, 4).toUpperCase(),
		color: `hsl(${Math.floor(Math.random() * 360)}, 70%, 40%)`
	};
	let collabSocket: WebSocket | undefined;

	collabSocket = new WebSocket('ws://localhost:8989');
	collabSocket.addEventListener('open', () => {
		collabSocket?.send(JSON.stringify({ type: 'hello', clientId: collabClientID }));
	});
	collabSocket.addEventListener('message', (event) => {
		const msg = JSON.parse(event.data);
		if (msg.type === 'init') {
			initialDoc = msg.doc ? JSON.stringify(msg.doc) : null;
			initialCollabVersion = msg.version;
			ready = true;
		} else if (msg.type === 'steps' && msg.steps.length) {
			editor?.collab.receiveSteps(msg.steps as CollabStepJSON[], msg.clientIDs as CollabClientID[]);
		} else if (msg.type === 'cursors') {
			const others = (msg.cursors as RemoteCursor[]).filter((c) => c.clientId !== collabClientID);
			editor?.cursors.set(others);
		}
	});
	collabSocket.addEventListener('error', () => {
		console.warn(
			'[richtext] collab server not reachable at ws://localhost:8989 - run `npm run dev:collab-server` (see DEV.md)'
		);
		// fall back to a plain empty local editor instead of leaving the page blank
		ready = true;
	});

	function sendCollabSteps(sendable: CollabSendable) {
		if (!collabSocket || collabSocket.readyState !== WebSocket.OPEN) return;
		collabSocket.send(JSON.stringify({ type: 'steps', ...sendable }));
	}

	function sendCollabCursor(cursor: { from: number; to: number } | null) {
		if (!collabSocket || collabSocket.readyState !== WebSocket.OPEN) return;
		collabSocket.send(
			JSON.stringify(
				cursor ? { type: 'cursor', ...cursor, user: collabUser } : { type: 'cursor', clear: true }
			)
		);
	}

	let editable = $state(true);

	const schema = getSchema({
		suggestions: true
	});

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
	// diff demo. Configured via editorConfig.suggestions below (like
	// fileUploader) rather than built and passed through the `plugins` prop.
	let suggestionMode: SuggestionMode = $state('editing');

	function setMode(newMode: SuggestionMode) {
		suggestionMode = newMode;
		editor?.suggestions.setMode(newMode);
	}

	function setContent() {
		editor.setContent(
			JSON.stringify({
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
			})
		);
	}
</script>

<div class="focus">
	<button onclick={() => editor.focus()}>Focus</button>
	<button onclick={setContent}>Set content</button>
	<button
		onclick={() => {
			editable = !editable;
			editor.setEditable(editable);
		}}
	>
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

<Base>
	<div class="container">
		{#if ready}
			<Editor
				bind:this={editor}
				value={initialDoc}
				onvaluechange={saveDoc}
				{schema}
				editorConfig={{
					codeBlockConfig: {
						language: true,
						annotations: true,
						annotationsUrl: null,
						fileName: true
					},
					colorButtonBackground: '#585895',
					fileUploader: async (blob, name, type) => {
						return {
							url: URL.createObjectURL(blob)
						};
					},
					image: {
					oversizedNoteText:
						'Image size is larger than the image preview in the editor. See the post preview for a better idea of how the image will look in the final post.'
				},
					embed: async (url) => {
						const youtube = url.match(
							/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/
						);
						if (youtube) {
							return `https://www.youtube.com/embed/${youtube[1]}`;
						}
						return null;
					},
					bookmark: async (url) => {
						let hostname = url;
						try {
							hostname = new URL(url).hostname;
						} catch (_) {
							// ignore
						}
						return {
							url,
							title: `Demo title for ${hostname}`,
							description: 'This is a demo bookmark description returned by the host app.',
							siteName: hostname,
							siteUrl: url,
							thumbnailUrl: null,
							iconUrl: null
						};
					},
					suggestions: {
						author: currentAuthor,
						mode: suggestionMode,
						resolveAuthor,
						source: createDemoSuggestionSource('suggestions-source')
					},
					collab: { version: initialCollabVersion, clientID: collabClientID, onSendable: sendCollabSteps },
					cursors: { onLocalCursorChange: sendCollabCursor, debounceMs: 300 }
				}}
			/>
		{/if}
	</div>
</Base>

<style>
	.container {
		margin: 10px auto;
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
