<script lang="ts">
	import { Editor } from '../src/lib';
	import { getSchema } from '../src/lib/schema';
	import { diffDoc, diffDecorationsPlugin, renderDiff, flattenDiffChanges, type Diff, type DiffChange } from '../src/lib/diff';
	import { Base } from '@hyvor/design/components';
	import type { Node as PMNode } from 'prosemirror-model';
	import type { EditorView } from 'prosemirror-view';

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

	function parseDoc(value: string): PMNode | { error: string } {
		try {
			return schema.nodeFromJSON(JSON.parse(value));
		} catch (e) {
			return { error: e instanceof Error ? e.message : String(e) };
		}
	}

	let parsedDocA = $derived(parseDoc(valueA));
	let parsedDocB = $derived(parseDoc(valueB));

	let diffResult: Diff[] | { error: string } = $derived.by(() => {
		if ('error' in parsedDocA) return parsedDocA;
		if ('error' in parsedDocB) return parsedDocB;
		try {
			return diffDoc(parsedDocA, parsedDocB);
		} catch (e) {
			return { error: e instanceof Error ? e.message : String(e) };
		}
	});

	let diffJson = $derived(JSON.stringify(diffResult, null, 2));

	// Flattened, individually acceptable/dismissable changes (Grammarly-style
	// suggestion list), in document order.
	let changes: DiffChange[] = $derived.by(() => {
		if (!Array.isArray(diffResult) || 'error' in parsedDocB) return [];
		return flattenDiffChanges(diffResult, schema, parsedDocB);
	});

	// Dismissed changes are only hidden from the list, not applied - keyed by
	// the change's tree-path id, which stays stable as long as valueA/valueB
	// don't change (accepting any change reshapes the tree and resets this).
	let dismissedIds: Set<string> = $state(new Set());
	let visibleChanges = $derived(changes.filter((change) => !dismissedIds.has(change.id)));

	let viewA: EditorView | undefined = $state();
	let diffEditorView: EditorView | undefined = $state();

	// Rebuilds the merged doc from the diff and applies it - together with
	// its diff decorations - directly onto the diff-display editor's view.
	$effect(() => {
		if (diffEditorView && Array.isArray(diffResult)) {
			renderDiff(diffEditorView, diffResult, schema);
		}
	});

	function acceptChange(change: DiffChange) {
		if (!viewA) return;
		const tr = viewA.state.tr;
		change.apply(tr);
		viewA.dispatch(tr);
		// Document A's own onvaluechange (wired below) updates valueA from this
		// dispatch, which reactively recomputes diffResult/changes.
	}

	function dismissChange(change: DiffChange) {
		dismissedIds = new Set(dismissedIds).add(change.id);
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
				oninit={(view) => (viewA = view)}
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
				<Editor
					value={JSON.stringify(defaultDocA)}
					editable={false}
					{schema}
					{editorConfig}
					plugins={[diffDecorationsPlugin()]}
					oninit={(view) => (diffEditorView = view)}
				/>
			</div>
			{#if mode === 'json'}
				<pre>{diffJson}</pre>
			{/if}
		</div>
		<div class="column changes-output">
			<h3>Changes ({visibleChanges.length})</h3>
			<div class="changes-list">
				{#if 'error' in diffResult}
					<p class="changes-empty">{diffResult.error}</p>
				{:else if visibleChanges.length === 0}
					<p class="changes-empty">No changes</p>
				{:else}
					{#each visibleChanges as change (change.id)}
						<div class="change-item change-{change.kind}">
							<span class="change-kind">{change.kind}</span>
							<p class="change-label">{change.label}</p>
							<div class="change-actions">
								<button class="accept" onclick={() => acceptChange(change)}>Accept</button>
								<button class="dismiss" onclick={() => dismissChange(change)}>Dismiss</button>
							</div>
						</div>
					{/each}
				{/if}
			</div>
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
	.diff-output pre {
		margin: 0;
		padding: 15px;
		white-space: pre-wrap;
		word-break: break-word;
		font-size: 12px;
		font-family: monospace;
	}

	.changes-output {
		flex: 0 0 300px;
		border-right: none;
	}

	.changes-list {
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.changes-empty {
		color: #888;
		font-size: 13px;
		padding: 10px 5px;
	}

	.change-item {
		border: 1px solid #ddd;
		border-left: 4px solid #999;
		border-radius: 4px;
		padding: 8px 10px;
		background: #fafafa;
	}

	.change-item.change-insert {
		border-left-color: #28a745;
	}

	.change-item.change-delete {
		border-left-color: #dc3545;
	}

	.change-item.change-replace {
		border-left-color: #3b82c4;
	}

	.change-item.change-format {
		border-left-color: #b8860b;
	}

	.change-kind {
		display: inline-block;
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #888;
		margin-bottom: 4px;
	}

	.change-label {
		margin: 0 0 8px 0;
		font-size: 13px;
		line-height: 1.4;
		word-break: break-word;
	}

	.change-actions {
		display: flex;
		gap: 6px;
	}

	.change-actions button {
		font-size: 12px;
		padding: 4px 10px;
		border-radius: 4px;
		border: 1px solid #ccc;
		background: #fff;
		cursor: pointer;
	}

	.change-actions button.accept {
		background: #28a745;
		border-color: #28a745;
		color: #fff;
	}

	.change-actions button.dismiss {
		color: #555;
	}
</style>
