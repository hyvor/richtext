<script lang="ts">
	import { Editor } from '../src/lib';
	import { getSchema } from '../src/lib/schema';
	import { diffDoc, buildDiffDoc, type Diff } from '../src/lib/diff';
	import {
		suggestionsPlugin,
		setSuggestionMode,
		type SuggestionMode,
		type Author,
		type AuthorInfo
	} from '../src/lib';
	import { Base, Button } from '@hyvor/design/components';

	const DIFF_AUTHOR: Author = 'user:diff';
	const REVIEWER_AUTHOR: Author = 'user:reviewer';

	function resolveAuthor(author: Author): AuthorInfo {
		if (author === DIFF_AUTHOR) return { name: 'Comparison' };
		if (author === REVIEWER_AUTHOR) return { name: 'Reviewer' };
		if (author === 'ai') return { name: 'AI' };
		return { name: author };
	}

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
			return buildDiffDoc(diffResult, schema, DIFF_AUTHOR).toJSON();
		} catch (e) {
			return null;
		}
	});

	// Attaching the suggestions plugin to the diff-display editor is what makes
	// it "editable like Google Docs": the suggestion mark (and node attr)
	// buildDiffDoc produced above are reviewable right inside that editor - it
	// shows its own floating accept/dismiss panel (see
	// src/lib/plugins/suggestions/SuggestionsPanel.svelte)
	// whenever there's a pending suggestion - and, while in "suggesting" mode,
	// further edits made directly in this editor are themselves tracked as new
	// suggestions rather than silently changing the merged doc.
	let suggestionMode: SuggestionMode = $state('suggesting');
	const diffSuggestionsPlugin = suggestionsPlugin({
		author: REVIEWER_AUTHOR,
		mode: suggestionMode,
		resolveAuthor
	});

	let diffEditor: Editor;

	// guards against re-applying logically-unchanged content: diffDocJson is a
	// freshly-built object every recompute (new reference), so without this the
	// effect below would call setContent again any time anything nudges this
	// effect to re-run, even with nothing new to show
	let lastAppliedDiffDoc: string | null = null;

	$effect(() => {
		if (!diffDocJson) return;
		const json = JSON.stringify(diffDocJson);
		if (json === lastAppliedDiffDoc) return;
		lastAppliedDiffDoc = json;
		diffEditor?.setContent(diffDocJson);
	});

	function setMode(newMode: SuggestionMode) {
		suggestionMode = newMode;
		const view = diffEditor?.getView();
		if (view) setSuggestionMode(view, newMode);
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
				</div>
				<Editor
					bind:this={diffEditor}
					value={JSON.stringify(diffDocJson ?? defaultDocA)}
					editable={true}
					plugins={[diffSuggestionsPlugin]}
					{schema}
					editorConfig={editorConfig}
				/>
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
	.diff-output pre {
		margin: 0;
		padding: 15px;
		white-space: pre-wrap;
		word-break: break-word;
		font-size: 12px;
		font-family: monospace;
	}
</style>
