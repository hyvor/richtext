<script lang="ts">
	import { EditorState } from 'prosemirror-state';
	import { EditorView, type DOMEventMap } from 'prosemirror-view';
	import { onDestroy, onMount } from 'svelte';
	import { getNodeViews } from './nodeviews/nodeviews';
	import { getPlugins } from './plugins/plugins';
	import { Loader } from '@hyvor/design/components';
	import { editorContent, editorStore, type Props } from './store';
	import { importCodemirrorAll } from './codemirror';
	import { getMarkViews } from './markviews/markviews';
	import { defaultEditorConfig, type EditorConfig } from './config';
	import {
		getSuggestionMode,
		setSuggestionMode,
		type SuggestionMode
	} from './plugins/suggestions/commands';
	import { SUGGESTIONS_SKIP_META } from './plugins/suggestions/plugin-suggestions';
	import {
		receiveCollabSteps,
		getCollabVersion,
		type CollabStepJSON,
		type CollabClientID
	} from './plugins/collab/plugin-collab';
	import { setRemoteCursors, type RemoteCursor } from './plugins/cursors/plugin-cursors';

	let props: Props = $props();

	let wrap: HTMLDivElement | undefined = $state();

	let isLoading = $state(true);
	let view: EditorView | undefined;

	const editorConfig: EditorConfig = $derived(
		Object.assign({}, defaultEditorConfig, props.editorConfig)
	);

	async function createEditor() {
		isLoading = true;
		await importCodemirrorAll();
		isLoading = false;

		const jsonParsedValue = props.value ? JSON.parse(props.value) : null;
		wrap!.innerHTML = '';

		let state = EditorState.create({
			schema: props.schema,
			plugins: [...getPlugins(props.schema, editorConfig), ...(props.plugins ?? [])],
			doc: props.value ? props.schema.nodeFromJSON(jsonParsedValue) : undefined
		});

		function getDomEvents() {
			const events: (keyof HTMLElementEventMap)[] = [
				'blur',
				'focus',
				'keydown',
				'keyup',
				'keypress',
				'click',
				'dblclick',
				'paste',
				'cut',
				'copy'
			];
			return events.reduce(
				(obj, e) => {
					return {
						...obj,
						[e]: <T extends keyof DOMEventMap>(view: EditorView, event: DOMEventMap[T]) =>
							props.ondomevent?.(e, event)
					};
				},
				{} as Record<keyof DOMEventMap, any>
			);
		}

		view = new EditorView(wrap!, {
			state: state,
			editable: () => props.editable ?? true,
			nodeViews: getNodeViews(editorConfig),
			markViews: getMarkViews(),
			handleDOMEvents: getDomEvents(),
			// handleClickOn,
			// handleKeyDown,
			dispatchTransaction: (tr) => {
				const docJson = JSON.stringify(tr.doc.toJSON());
				editorContent.set(docJson);

				const state = view!.state.apply(tr);
				view!.updateState(state);

				props.onvaluechange?.(docJson);
			}
		});

		editorStore.set({ view, props });

		props.oninit?.(view);

		return view;
	}

	onMount(() => {
		createEditor();
	});

	function handleWrapClick(e: MouseEvent | KeyboardEvent) {
		if (e.target === wrap) view?.focus();
	}

	export function getSchema() {
		return props.schema;
	}

	/**
	 * @param content JSON string or object for the document
	 */
	export function setContent(content: string | object) {
		if (!view) return;
		const doc = props.schema.nodeFromJSON(
			typeof content === 'string' ? JSON.parse(content) : content
		);
		const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content);
		// settings the whole document is not a suggestion
		tr.setMeta(SUGGESTIONS_SKIP_META, true);
		view.dispatch(tr);
	}

	export function getContent(): object {
		return view?.state.doc.toJSON();
	}

	export function clearContent() {
		setContent({
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: []
				}
			]
		});
	}

	export function getView() {
		return view;
	}

	export function focus() {
		view?.focus();
	}

	export function setEditable(editable: boolean) {
		view?.setProps({
			editable: () => editable
		});
	}

	export function isEditable(): boolean {
		if (!view) return false;
		return view.editable;
	}

	export const suggestions = {
		getMode(): SuggestionMode {
			return view ? getSuggestionMode(view.state) : 'editing';
		},
		setMode(mode: SuggestionMode) {
			if (view) setSuggestionMode(view, mode);
		}
	};

	export const collab = {
		// feed remote steps from authority to the editor
		receiveSteps(steps: CollabStepJSON[], clientIDs: CollabClientID[]) {
			if (view) receiveCollabSteps(view, steps, clientIDs);
		},
		getVersion(): number {
			return view ? getCollabVersion(view) : 0;
		}
	};

	export const cursors = {
		set(remoteCursors: RemoteCursor[]) {
			if (view) setRemoteCursors(view, remoteCursors);
		}
	};

	onDestroy(() => {
		view?.destroy();
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="pm-editor"
	bind:this={wrap}
	onclick={handleWrapClick}
	onkeyup={(e) => e.key === 'Enter' && handleWrapClick(e)}
	class:loaded={!isLoading}
	style:--button-background={editorConfig.colorButtonBackground}
	style:--button-text={editorConfig.colorButtonText}
>
	{#if isLoading}
		<Loader block padding={250} />
	{/if}
</div>

<style>
	.pm-editor {
		--prosemirror-hover-outline: 2px solid #8cf;
		--prosemirror-selected-background: rgba(41, 154, 243, 0.15);
		position: relative;
		height: 100%;
	}

	.pm-editor.loaded {
		padding-bottom: 100px;
	}

	.pm-editor :global(.ProseMirror) {
		font-size: 18px;
		padding: 25px 30px;
		min-height: 620px;
		margin: auto;
		width: 700px;
		max-width: 100%;
		word-wrap: break-word;
		white-space: pre-wrap;
		white-space: break-spaces;
		-webkit-font-variant-ligatures: none;
		font-variant-ligatures: none;
		font-feature-settings: 'liga' 0;
	}

	.pm-editor :global(.ProseMirror:focus-visible) {
		outline: none;
	}

	.pm-editor :global(.ProseMirror-hideselection *::selection) {
		background: transparent;
	}

	.pm-editor :global(.ProseMirror-hideselection *::-moz-selection) {
		background: transparent;
	}

	.pm-editor :global(.ProseMirror-hideselection) {
		caret-color: transparent;
	}

	.pm-editor :global(.ProseMirror-selectednode) {
		outline: none !important;
		border-radius: 6px;
		background-color: var(--prosemirror-selected-background);
		box-shadow: 0 0 0 4px var(--prosemirror-selected-background);
	}

	.pm-editor :global(img.ProseMirror-separator) {
		display: inline !important;
		border: none !important;
		margin: 0 !important;
	}

	.pm-editor :global(.ProseMirror[data-placeholder]::before) {
		color: var(--text-light);
		position: absolute;
		content: attr(data-placeholder);
		pointer-events: none;
		line-height: 30px;
	}

	.pm-editor :global(.ProseMirror > *:first-child) {
		margin-top: 0 !important;
	}

	.pm-editor :global(p),
	.pm-editor :global(h1),
	.pm-editor :global(h2),
	.pm-editor :global(h3),
	.pm-editor :global(h4),
	.pm-editor :global(h5),
	.pm-editor :global(h6),
	.pm-editor :global(blockquote),
	.pm-editor :global(aside),
	.pm-editor :global(figure),
	.pm-editor :global(pre),
	.pm-editor :global(ul),
	.pm-editor :global(ol),
	.pm-editor :global(bookmark)
	{
		line-height: 30px;
		margin-top: 20px;
		margin-bottom: 0;
		letter-spacing: 0.2px;
		font-family: var(--font-serif);
	}

	.pm-editor :global(.heading-wrap) {
		position: relative;
	}

	.pm-editor :global(.heading-wrap .heading-details) {
		position: absolute;
		bottom: 100%;
		left: 0;
		color: var(--text-light);
		font-size: 12px;
		margin-bottom: 4px;
		display: none;
		flex-direction: row;
		width: 100%;
		align-items: center;
	}

	.pm-editor :global(.heading-wrap.heading-focused .heading-details) {
		display: flex;
	}

	.pm-editor :global(.heading-wrap .heading-compact) {
		position: absolute;
		bottom: 100%;
		left: 0;
		color: var(--text-light);
		font-size: 11px;
		opacity: 0.6;
		animation: fadeIn06 0.2s ease-in-out;
	}

	.pm-editor :global(.heading-wrap.heading-focused .heading-compact) {
		display: none;
	}

	.pm-editor :global(.heading-wrap input) {
		padding: 0;
		background: transparent;
		border: none;
		width: 100%;
		outline: none;
		flex: 1;
		display: block;
		font-family: inherit;
		font-size: inherit;
		margin-left: 1px;
	}

	.pm-editor :global(.heading-wrap .input-wrap) {
		display: flex;
		flex: 1;
		margin-left: 4px;
		animation: fadeIn 0.2s ease-in-out;
	}

	.pm-editor :global(.heading-selectors-wrap) {
		display: flex;
		animation: fadeIn 0.2s ease-in-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes fadeIn06 {
		from {
			opacity: 0;
		}
		to {
			opacity: 0.6;
		}
	}

	.pm-editor :global(.heading-selectors-wrap button) {
		font-size: 10px;
		background-color: var(--input);
		padding: 2px 4px;
		margin-right: 2px;
		border-radius: 2px;
		opacity: 0.3;
		transition: 0.2s opacity;
	}

	.pm-editor :global(.heading-selectors-wrap:hover button) {
		opacity: 0.5;
	}

	.pm-editor :global(.heading-selectors-wrap button:hover) {
		opacity: 0.7;
	}

	.pm-editor :global(.heading-selectors-wrap button.selected) {
		background-color: var(--gray-light);
		opacity: 1;
	}

	.pm-editor :global(h1),
	.pm-editor :global(h2),
	.pm-editor :global(h3),
	.pm-editor :global(h4),
	.pm-editor :global(h5),
	.pm-editor :global(h6) {
		margin-top: 35px;
		line-height: 1.3;
	}

	.pm-editor :global(h1) {
		font-size: 2em;
	}

	.pm-editor :global(h2) {
		font-size: 1.5em;
	}

	.pm-editor :global(h3) {
		font-size: 1.3em;
	}

	.pm-editor :global(h4) {
		font-size: 1.2em;
	}

	.pm-editor :global(h5) {
		font-size: 1.1em;
	}

	.pm-editor :global(h6) {
		font-size: 1em;
	}

	.pm-editor :global(hr) {
		box-sizing: border-box;
		margin: 14px 0;
		padding: 16px 0;
		border: none;
		position: relative;
	}
	.pm-editor :global(hr:before) {
		content: '';
		display: block;
		height: 1px;
		background-color: var(--text-light);
		position: absolute;
		top: 50%;
		left: 0;
		right: 0;
	}

	.pm-editor :global(blockquote),
	.pm-editor :global(aside) {
		margin-top: 30px;
		border-width: 0;
		border-color: #000000;
		border-style: solid;
		border-left-width: 4px;
		padding: 10px 15px;
	}

	.pm-editor :global(blockquote *:first-child),
	.pm-editor :global(aside *:first-child) {
		margin-top: 0;
	}

	.pm-editor :global(aside) {
		border-left: none;
		border-radius: 5px;
		display: flex;
		padding: 0;
		position: relative;
	}

	.pm-editor :global(aside .emoji-icon) {
		cursor: pointer;
		user-select: none;
		padding: 10px 12px;
	}

	.pm-editor :global(aside .emoji-icon .dropdown) {
		display: inline-flex;
		justify-content: center;
		color: var(--text);
	}

	.pm-editor :global(aside .content-div) {
		flex: 1;
		padding: 10px 10px 10px 0;
	}

	.pm-editor :global(aside .color-pickers-wrap) {
		position: absolute;
		right: 0;
		bottom: 100%;
	}

	.pm-editor :global(figure) {
		margin-top: 45px;
	}

	.pm-editor :global(figure figcaption) {
		padding: 7px;
		font-size: 14px;
		text-align: center;
	}

	.pm-editor :global(figure figcaption.empty:before) {
		content: 'Enter caption...';
		color: #aaa;
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		pointer-events: none;
	}

	.pm-editor :global(figure x-embed) {
		position: relative;
		display: block;
	}

	.pm-editor :global(figure x-embed:before) {
		content: '';
		position: absolute;
		z-index: 1;
		width: 100%;
		height: 100%;
		top: 0;
		left: 0;
	}

	.pm-editor :global(img) {
		display: block;
		margin: auto;
		object-fit: cover;
		max-width: 100%;
	}

	.pm-editor :global(li > *) {
		margin: 5px 0 !important;
	}

	.pm-editor :global(.code-wrap) {
		margin-top: 30px;
	}

	.pm-editor :global(.code-wrap .code-toolbar) {
		white-space: normal;
		padding: 10px;
		background: var(--input);
		border-radius: 20px 20px 0 0;
		border-bottom: 1px solid #dddddd;
	}

	.pm-editor :global(.code-wrap .code-toolbar-labels) {
		display: flex;
		font-size: 12px;
	}

	.pm-editor :global(.code-wrap .code-toolbar-labels div) {
		flex: 1;
		padding-left: 4px;
	}

	.pm-editor :global(.code-wrap .code-toolbar-inputs) {
		display: flex;
	}

	.pm-editor :global(.code-wrap .code-toolbar-inputs input) {
		flex: 1;
		min-width: 0;
		margin-right: 5px;
		padding: 5px 10px;
		font-size: 12px;
		margin-top: 5px;
		background: #fff;
		border: none;
		border-radius: 20px;
		font-family: inherit;
	}

	.pm-editor :global(.code-wrap .CodeMirror) {
		font-size: 14px;
		height: initial;
		padding: 5px 0;
		padding-bottom: 15px;
		border-radius: 0 0 20px 20px;
		font-family:
			source-code-pro,
			Menlo,
			Courier New,
			Consolas,
			monospace !important;
		box-shadow: none !important;
		background-color: var(--input);
	}

	.pm-editor :global(.code-wrap .CodeMirror-gutters) {
		background-color: transparent;
	}

	.pm-editor :global(.code-wrap.no-toolbar .CodeMirror) {
		border-radius: 20px;
	}

	.pm-editor :global(.code-wrap .topbar) {
		background: var(--input);
		border-radius: 20px 20px 0 0;
		border-bottom: 1px solid #dddddd;
		font-size: 12px;
		padding: 10px 15px;
	}

	.pm-editor :global(.code-wrap .code-toolbar-quit-message) {
		position: absolute;
		bottom: 0;
		right: 0;
		font-size: 10px;
		padding-right: 10px;
		color: var(--text-light);
	}

	.pm-editor :global(:not(pre) > code) {
		background: rgba(135, 131, 120, 0.15);
		color: #eb5757;
		border-radius: 3px;
		font-size: 85%;
		padding: 0.2em 0.4em;
		font-family: monospace;
	}

	.pm-editor :global(a) {
		color: var(--link);
		text-decoration: underline;
	}

	.pm-editor :global(mark) {
		padding: 0.2em 0.4em;
		background-color: #fcf8e3;
	}

	.pm-editor :global(.table-wrap) {
		margin-top: 30px;
	}

	.pm-editor :global(.table-wrap .table-middle) {
		overflow-x: auto;
		overflow-y: hidden;
	}

	.pm-editor :global(table) {
		margin: 0;
		margin-top: 5px;
		border: 1px solid black;
		border-collapse: collapse;
		table-layout: fixed;
		white-space: break-spaces;
	}

	.pm-editor :global(table tr) {
		height: 20px;
		width: 150px;
	}

	.pm-editor :global(table th),
	.pm-editor :global(table td) {
		width: 150px;
		height: 40px;
		border: 1px solid #ddd;
		padding: 7px 15px;
		vertical-align: top;
		box-sizing: border-box;
		position: relative;
	}

	.pm-editor :global(table th p),
	.pm-editor :global(table td p) {
		margin-top: 0;
	}

	.pm-editor :global(table th) {
		font-weight: bold;
		text-align: left;
	}

	.pm-editor :global(table .column-resize-handle) {
		position: absolute;
		right: -2px;
		top: 0;
		bottom: -2px;
		width: 4px;
		background-color: #adf;
		cursor: col-resize;
	}

	.pm-editor :global(table .selectedCell:after) {
		z-index: 2;
		position: absolute;
		content: '';
		left: 0;
		right: 0;
		top: 0;
		bottom: 0;
		background: rgba(200, 200, 255, 0.4);
		pointer-events: none;
		cursor: default;
	}

	.pm-editor :global(.user-comment) {
		border-bottom: 3px solid #e0d32e;
		background-color: rgba(224, 211, 46, 0.15);
		cursor: pointer;
	}

	.pm-editor :global(.user-comment:hover) {
		background-color: rgba(224, 211, 46, 0.3);
	}

	/* a comment thread attached to a whole node (an image, a table, ...) via
	   the `suggestions` node attr - see plugin-suggestions.ts's decorations(),
	   since (unlike the suggestion mark's "comment" subtype) a node attr has
	   no DOM of its own */
	.pm-editor :global(.node-comment) {
		outline: 2px dashed #e0d32e;
		outline-offset: 2px;
		border-radius: 6px;
		cursor: pointer;
	}

	.pm-editor :global(.comment-tick) {
		position: fixed;
		width: 16px;
		height: 16px;
		border: 8px solid transparent;
		border-left-color: #e0d32e;
		transform: translateY(-50%);
	}

	.pm-editor :global(.button-wrap) {
		margin-top: 30px;
		text-align: center;
	}
	.pm-editor :global(.button-wrap a.button) {
		display: inline-block;
		padding: 10px 20px;
		font-weight: 600;
		background-color: var(--button-background);
		color: var(--button-text);
		text-decoration: none;
		border-radius: 5px;
		cursor: text;
	}

	.pm-editor :global(.button-wrap a.button:empty::before) {
		content: 'Your text here';
		color: var(--text-light);
	}

	/* inline suggestion marks - see schema.ts and src/lib/plugins/suggestions */

	.pm-editor :global(ins.suggestion-insert) {
		text-decoration: underline;
		text-decoration-color: #2e9e5b;
		background-color: rgba(46, 158, 91, 0.15);
		color: inherit;
	}

	.pm-editor :global(del.suggestion-delete) {
		text-decoration: line-through;
		text-decoration-color: #d64545;
		background-color: rgba(214, 69, 69, 0.12);
		color: inherit;
		opacity: 0.75;
	}

	.pm-editor :global(span.suggestion-format) {
		text-decoration: underline wavy;
		text-decoration-color: #b5892e;
		text-underline-offset: 3px;
	}


	/* whole-node suggestions (a deleted/inserted/reformatted block or atom node
	   that can't carry an inline mark) - rendered as decorations from the
	   `suggestions` node attr, see plugin-suggestions.ts */

	.pm-editor :global(.suggestion-node-insert) {
		outline: 2px dashed #2e9e5b;
		outline-offset: 2px;
		border-radius: 6px;
		background-color: rgba(46, 158, 91, 0.08);
	}

	.pm-editor :global(.suggestion-node-delete) {
		opacity: 0.5;
		outline: 2px dashed #d64545;
		outline-offset: 2px;
	}

	.pm-editor :global(.suggestion-node-format) {
		outline: 2px dashed #b5892e;
		outline-offset: 2px;
		border-radius: 6px;
	}

	/* a whole-node replace (diff/render.ts's 'replace' case, or diff/node.ts
	   falling back to one for a heavily-rewritten paragraph/heading) - a
	   deleted node immediately followed by its replacement, sharing one
	   suggestion id. Flush their outlines together into one continuous card
	   with the connector label below in between, so the pair reads as one
	   "this became that" change instead of two unrelated edits. */
	.pm-editor :global(.suggestion-node-replace-delete) {
		outline-offset: 0;
		border-radius: 6px 6px 0 0;
	}

	.pm-editor :global(.suggestion-node-replace-insert) {
		outline-offset: 0;
		border-radius: 0 0 6px 6px;
		margin-top: 0 !important;
	}

	.pm-editor :global(.suggestion-replace-connector) {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 3px 10px;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #8a5fd6;
		user-select: none;
	}

	.pm-editor :global(.suggestion-replace-connector::before),
	.pm-editor :global(.suggestion-replace-connector::after) {
		content: '';
		flex: 1;
		height: 1px;
		background: currentColor;
		opacity: 0.35;
	}

	/* other users' cursors/selections - see plugin-cursors.ts. --cursor-color
	   is set per-instance from RemoteCursorUser.color via decoration style */

	.pm-editor :global(.remote-cursor-selection) {
		background-color: color-mix(in srgb, var(--cursor-color) 30%, transparent);
		border-radius: 2px;
	}

	.pm-editor :global(.remote-cursor-caret) {
		position: relative;
		display: inline-block;
		width: 0;
		height: 1.2em;
		vertical-align: text-bottom;
		padding: 0 4px;
		margin: 0 -4px;
	}

	.pm-editor :global(.remote-cursor-caret::before) {
		content: '';
		position: absolute;
		left: 4px;
		top: 0;
		width: 2px;
		height: 100%;
		background-color: var(--cursor-color);
	}

	.pm-editor :global(.remote-cursor-flag) {
		position: absolute;
		left: 3px;
		bottom: 100%;
		transform: translateY(-4px);
		white-space: nowrap;
		padding: 2px 6px;
		border-radius: 4px;
		background-color: var(--cursor-color);
		color: #fff;
		font-size: 11px;
		font-family: inherit;
		line-height: 1.4;
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.15s ease-in-out;
		z-index: 20;
	}

	.pm-editor :global(.remote-cursor-caret:hover .remote-cursor-flag) {
		opacity: 1;
	}
</style>
