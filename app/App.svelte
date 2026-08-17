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

	// `doc` and `doc-collab-version` are always written together (see
	// saveDoc below) so a reload resumes from a (doc, version) pair that's
	// actually consistent with each other, instead of re-sending/re-applying
	// steps the saved doc already reflects.
	const COLLAB_VERSION_KEY = 'doc-collab-version';
	const initialCollabVersion = Number(localStorage.getItem(COLLAB_VERSION_KEY) ?? 0);

	function saveDoc(val: string) {
		localStorage.setItem('doc', val);
		localStorage.setItem(COLLAB_VERSION_KEY, String(editor?.collab.getVersion() ?? 0));
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
		// tells the server which steps (if any) this client is still missing,
		// and which clientId to associate with this connection - see
		// dev-server/collab-server.mjs's 'hello' handling
		collabSocket?.send(
			JSON.stringify({ type: 'hello', version: initialCollabVersion, clientId: collabClientID })
		);
	});
	collabSocket.addEventListener('message', (event) => {
		const msg = JSON.parse(event.data);
		if ((msg.type === 'init' || msg.type === 'steps') && msg.steps.length) {
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
		<Editor
			bind:this={editor}
			value={localStorage.getItem('doc')}
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
