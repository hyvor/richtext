<script lang="ts">
	import { EditorView } from 'prosemirror-view';
	import {
		Editor,
		setSuggestionMode,
		setSuggestionUser,
		getSuggestions,
		acceptSuggestion,
		rejectSuggestion,
		acceptAllSuggestions,
		rejectAllSuggestions,
		type SuggestionItem,
		type SuggestionMode,
		type SuggestionUser
	} from '../src/lib';
	import { Base, Button } from '@hyvor/design/components';

	let editorView: EditorView = $state({} as EditorView);

	const users: SuggestionUser[] = [
		{ id: 'alice', name: 'Alice' },
		{ id: 'bob', name: 'Bob' }
	];

	let currentUser = $state<SuggestionUser>(users[0]);
	let mode = $state<SuggestionMode>('editing');
	let suggestions = $state<SuggestionItem[]>([]);

	function editorReady() {
		return typeof editorView?.dispatch === 'function';
	}

	function refreshSuggestions() {
		if (!editorReady()) return;
		suggestions = getSuggestions(editorView.state);
	}

	function onValueChange(val: string) {
		localStorage.setItem('doc', val);
		refreshSuggestions();
	}

	function setMode(newMode: SuggestionMode) {
		mode = newMode;
		if (editorReady()) setSuggestionMode(editorView, newMode);
		refreshSuggestions();
	}

	function selectUser(user: SuggestionUser) {
		currentUser = user;
		if (editorReady()) setSuggestionUser(editorView, user);
	}

	function accept(id: string) {
		acceptSuggestion(editorView, id);
		refreshSuggestions();
	}

	function reject(id: string) {
		rejectSuggestion(editorView, id);
		refreshSuggestions();
	}

	function acceptAll() {
		acceptAllSuggestions(editorView);
		refreshSuggestions();
	}

	function rejectAll() {
		rejectAllSuggestions(editorView);
		refreshSuggestions();
	}

	function suggestionLabel(item: SuggestionItem): string {
		const parts: string[] = [];
		if (item.deletedNodeType) parts.push(`- [${item.deletedNodeType}]`);
		if (item.insertedText) parts.push(`+ "${item.insertedText}"`);
		if (item.deletedText) parts.push(`- "${item.deletedText}"`);
		if (item.formatAdd.length) parts.push(`format: +${item.formatAdd.join(', +')}`);
		if (item.formatRemove.length) parts.push(`format: -${item.formatRemove.join(', -')}`);
		return parts.join('  ') || '(no visible change)';
	}
</script>

<Base>
	<div class="toolbar">
		<div class="group">
			<span class="label">Mode</span>
			<Button
				size="small"
				color={mode === 'editing' ? 'accent' : 'gray'}
				onclick={() => setMode('editing')}
			>
				Editing
			</Button>
			<Button
				size="small"
				color={mode === 'suggesting' ? 'accent' : 'gray'}
				onclick={() => setMode('suggesting')}
			>
				Suggesting
			</Button>
		</div>

		<div class="group">
			<span class="label">Editing as</span>
			{#each users as user (user.id)}
				<Button
					size="small"
					color={currentUser.id === user.id ? 'accent' : 'gray'}
					onclick={() => selectUser(user)}
				>
					{user.name}
				</Button>
			{/each}
		</div>
	</div>

	<div class="container">
		<Editor
			bind:editorView
			value={localStorage.getItem('doc')}
			onvaluechange={onValueChange}
			suggestionUser={currentUser}
			config={{
				codeBlockConfig: {
					language: true,
					annotations: true,
					annotationsUrl: null,
					fileName: true
				},
				embedEnabled: true,
				tableEnabled: true,
				colorButtonBackground: '#585895',
				fileUploader: async (blob, name, type) => {
					return {
						url: URL.createObjectURL(blob)
					};
				}
			}}
		/>
	</div>

	<div class="suggestions-panel">
		<div class="suggestions-header">
			<h3>Suggestions ({suggestions.length})</h3>
			{#if suggestions.length > 0}
				<div class="bulk-actions">
					<Button size="x-small" color="green" onclick={acceptAll}>Accept all</Button>
					<Button size="x-small" color="red" onclick={rejectAll}>Reject all</Button>
				</div>
			{/if}
		</div>

		{#if suggestions.length === 0}
			<p class="empty">
				No pending suggestions. Switch to "Suggesting" mode above and edit the document to
				create some.
			</p>
		{:else}
			<ul>
				{#each suggestions as item (item.id)}
					<li>
						<div class="meta">
							<strong>{item.user.name || 'Unknown user'}</strong>
							<span class="change">{suggestionLabel(item)}</span>
						</div>
						<div class="actions">
							<Button size="x-small" color="green" onclick={() => accept(item.id)}>
								Accept
							</Button>
							<Button size="x-small" color="red" onclick={() => reject(item.id)}>Reject</Button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</Base>

<div class="focus">
	<button onclick={() => editorView.focus()}>Focus</button>
</div>

<style>
	.toolbar {
		margin: 60px auto 0 auto;
		width: 650px;
		display: flex;
		justify-content: space-between;
		gap: 20px;
		flex-wrap: wrap;
	}
	.toolbar .group {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.toolbar .label {
		font-size: 12px;
		color: #888;
		margin-right: 4px;
	}
	.container {
		margin: 20px auto;
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
	.suggestions-panel {
		margin: 20px auto 60px auto;
		width: 650px;
		border: 1px solid #ccc;
		border-radius: 12px;
		padding: 16px 20px;
	}
	.suggestions-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.suggestions-header h3 {
		margin: 0;
		font-size: 15px;
	}
	.bulk-actions {
		display: flex;
		gap: 6px;
	}
	.suggestions-panel .empty {
		color: #888;
		font-size: 13px;
	}
	.suggestions-panel ul {
		list-style: none;
		margin: 10px 0 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.suggestions-panel li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 8px 10px;
		background: #f7f7f7;
		border-radius: 8px;
	}
	.suggestions-panel .meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.suggestions-panel .change {
		font-size: 12px;
		color: #555;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.suggestions-panel .actions {
		display: flex;
		gap: 6px;
		flex-shrink: 0;
	}
</style>
