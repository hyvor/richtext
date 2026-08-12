<script lang="ts">
	import { Editor } from '../src/lib';
	import { getSchema } from '../src/lib/schema';
	import { diffDoc, buildDiffDoc, type Diff } from '../src/lib/diff';
	import {
		suggestionsPlugin,
		setSuggestionMode,
		getSuggestions,
		acceptSuggestion,
		rejectSuggestion,
		acceptAllSuggestions,
		rejectAllSuggestions,
		type SuggestionItem,
		type SuggestionMode
	} from '../src/lib';
	import { Base, Button } from '@hyvor/design/components';

	const STORAGE_KEY_A = 'diff-doc-a';
	const STORAGE_KEY_B = 'diff-doc-b';

	const defaultDocA = {
		type: 'doc',
		content: [
			{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] },
			{ type: 'paragraph', content: [{ type: 'text', text: 'This is a test paragraph.' }] }
		]
	};

	const defaultDocB = {
		type: 'doc',
		content: [
			{ type: 'paragraph', content: [{ type: 'text', text: 'Hello beautiful world' }] },
			{ type: 'paragraph', content: [{ type: 'text', text: 'This is a new paragraph.' }] },
			{ type: 'paragraph', content: [{ type: 'text', text: 'This is a test paragraph.' }] }
		]
	};

	function readStored(key: string, fallback: object): string {
		const raw = localStorage.getItem(key);
		if (!raw) return JSON.stringify(fallback);
		try {
			JSON.parse(raw);
			return raw;
		} catch {
			return JSON.stringify(fallback);
		}
	}

	const editorConfig = {
		fileUploader: async (blob: Blob) => ({ url: URL.createObjectURL(blob) })
	};

	const schema = getSchema();

	let valueA = $state(readStored(STORAGE_KEY_A, defaultDocA));
	let valueB = $state(readStored(STORAGE_KEY_B, defaultDocB));
	let mode: 'display' | 'json' = $state('display');

	let diffResult: Diff[] | { error: string } = $derived.by(() => {
		try {
			const docA = schema.nodeFromJSON(JSON.parse(valueA));
			const docB = schema.nodeFromJSON(JSON.parse(valueB));
			return diffDoc(docA, docB);
		} catch (e) {
			return { error: e instanceof Error ? e.message : String(e) };
		}
	});

	let diffJson = $derived(JSON.stringify(diffResult, null, 2));

	// The merged doc is rebuilt from the diff and re-parsed through JSON so it
	// can be handed to the diff-display Editor below (which shares the same
	// schema instance as documents A/B).
	let diffDocJson: object | null = $derived.by(() => {
		if (!Array.isArray(diffResult)) return null;
		try {
			return buildDiffDoc(diffResult, schema, { id: 'diff', name: 'Comparison' }).toJSON();
		} catch (e) {
			return null;
		}
	});

	// Attaching the suggestions plugin to the diff-display editor is what makes
	// it "editable like Google Docs": the suggestion_insert/suggestion_delete/
	// suggestion_format marks (and node attrs) buildDiffDoc produced above can
	// be reviewed (accepted/rejected) via the commands below, and - while in
	// "suggesting" mode - further edits made directly in this editor are
	// themselves tracked as new suggestions rather than silently changing the
	// merged doc.
	let suggestionMode: SuggestionMode = $state('suggesting');
	const diffSuggestionsPlugin = suggestionsPlugin({
		user: { id: 'reviewer', name: 'Reviewer' },
		mode: suggestionMode
	});

	let diffEditor: Editor;
	let suggestions: SuggestionItem[] = $state([]);

	function refreshSuggestions() {
		const view = diffEditor?.getView();
		if (!view) return;
		suggestions = getSuggestions(view.state);
	}

	$effect(() => {
		if (diffDocJson) {
			diffEditor?.setContent(diffDocJson);
			refreshSuggestions();
		}
	});

	function setMode(newMode: SuggestionMode) {
		suggestionMode = newMode;
		const view = diffEditor?.getView();
		if (view) setSuggestionMode(view, newMode);
	}

	function accept(id: string) {
		const view = diffEditor?.getView();
		if (!view) return;
		acceptSuggestion(view, id);
		refreshSuggestions();
	}

	function reject(id: string) {
		const view = diffEditor?.getView();
		if (!view) return;
		rejectSuggestion(view, id);
		refreshSuggestions();
	}

	function acceptAll() {
		const view = diffEditor?.getView();
		if (!view) return;
		acceptAllSuggestions(view);
		refreshSuggestions();
	}

	function rejectAll() {
		const view = diffEditor?.getView();
		if (!view) return;
		rejectAllSuggestions(view);
		refreshSuggestions();
	}

	function suggestionLabel(item: SuggestionItem): string {
		const parts: string[] = [];
		if (item.deletedNodeType) parts.push(`- [${item.deletedNodeType}]`);
		if (item.insertedNodeType) parts.push(`+ [${item.insertedNodeType}]`);
		if (item.formattedNodeType) parts.push(`~ [${item.formattedNodeType}]`);
		if (item.insertedText) parts.push(`+ "${item.insertedText}"`);
		if (item.deletedText) parts.push(`- "${item.deletedText}"`);
		if (item.formatAdd.length) parts.push(`format: +${item.formatAdd.join(', +')}`);
		if (item.formatRemove.length) parts.push(`format: -${item.formatRemove.join(', -')}`);
		return parts.join('  ') || '(no visible change)';
	}
</script>

<Base>
	<div class="diff-page">
		<div class="column">
			<h3>Document A</h3>
			<Editor
				value={valueA}
				{schema}
				editorConfig={editorConfig}
				onvaluechange={(val) => {
					valueA = val;
					localStorage.setItem(STORAGE_KEY_A, val);
				}}
			/>
		</div>
		<div class="column">
			<h3>Document B</h3>
			<Editor
				value={valueB}
				{schema}
				editorConfig={editorConfig}
				onvaluechange={(val) => {
					valueB = val;
					localStorage.setItem(STORAGE_KEY_B, val);
				}}
			/>
		</div>
		<div class="column diff-output">
			<h3>
				Diff
				<div class="mode-switch">
					<button class:active={mode === 'display'} onclick={() => (mode = 'display')}>Display</button>
					<button class:active={mode === 'json'} onclick={() => (mode = 'json')}>JSON</button>
				</div>
			</h3>
			<div class="diff-display" class:hidden={mode !== 'display'}>
				<div class="suggestions-toolbar">
					<div class="group">
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
					{#if suggestions.length > 0}
						<div class="group">
							<Button size="x-small" color="green" onclick={acceptAll}>Accept all</Button>
							<Button size="x-small" color="red" onclick={rejectAll}>Reject all</Button>
						</div>
					{/if}
				</div>
				<Editor
					bind:this={diffEditor}
					value={JSON.stringify(diffDocJson ?? defaultDocA)}
					editable={true}
					plugins={[diffSuggestionsPlugin]}
					oninit={refreshSuggestions}
					onvaluechange={refreshSuggestions}
					{schema}
					editorConfig={editorConfig}
				/>
				<div class="suggestions-panel">
					<h4>Suggestions ({suggestions.length})</h4>
					{#if suggestions.length === 0}
						<p class="empty">No pending suggestions.</p>
					{:else}
						<ul>
							{#each suggestions as item (item.id)}
								<li>
									<div class="meta">
										<strong>{item.user.name || 'Unknown user'}</strong>
										<span class="change">{suggestionLabel(item)}</span>
									</div>
									<div class="actions">
										<Button size="x-small" color="green" onclick={() => accept(item.id)}>Accept</Button>
										<Button size="x-small" color="red" onclick={() => reject(item.id)}>Reject</Button>
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</div>
			{#if mode === 'json'}
				<pre>{diffJson}</pre>
			{/if}
		</div>
	</div>
</Base>

<style>
	.diff-page {
		display: flex;
		align-items: flex-start;
		height: 100vh;
	}
	.column {
		flex: 1;
		min-width: 0;
		height: 100%;
		overflow: auto;
		border-right: 1px solid #ccc;
		box-sizing: border-box;
	}
	.column h3 {
		margin: 0;
		padding: 10px 15px;
		border-bottom: 1px solid #ccc;
		position: sticky;
		top: 0;
		background: #fff;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.mode-switch {
		display: flex;
		gap: 4px;
	}
	.mode-switch button {
		font-size: 11px;
		font-weight: normal;
		padding: 4px 8px;
		border: 1px solid #ccc;
		border-radius: 4px;
		background: #fff;
		cursor: pointer;
	}
	.mode-switch button.active {
		background: #333;
		color: #fff;
		border-color: #333;
	}
	.diff-display.hidden {
		display: none;
	}
	.suggestions-toolbar {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 8px 15px;
		background: #fafafa;
		border-bottom: 1px solid #ccc;
	}
	.suggestions-toolbar .group {
		display: flex;
		gap: 6px;
	}
	.suggestions-panel {
		border-top: 1px solid #ccc;
		padding: 12px 15px 30px 15px;
	}
	.suggestions-panel h4 {
		margin: 0 0 8px 0;
		font-size: 13px;
	}
	.suggestions-panel .empty {
		color: #888;
		font-size: 13px;
		margin: 0;
	}
	.suggestions-panel ul {
		list-style: none;
		margin: 0;
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
	.diff-output pre {
		margin: 0;
		padding: 15px;
		white-space: pre-wrap;
		word-break: break-word;
		font-size: 12px;
		font-family: monospace;
	}
</style>
