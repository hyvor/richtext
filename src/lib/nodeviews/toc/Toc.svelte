<script lang="ts">
	import type { EditorView } from 'prosemirror-view';
	import { onMount } from 'svelte';
	import { generateToc } from './toc';
	import TocChildren from './TocChildren.svelte';
	import TocLevels from './TocLevels.svelte';
	import { IconMessage } from '@hyvor/design/components';
	import { editorContent } from '../../store';
	import { getDocFromContent } from '../../helpers';

	interface Props {
		view: EditorView;
		levels?: number[];
		getPos: () => number | undefined;
	}

	let { view, levels = [1, 2, 3, 4], getPos }: Props = $props();

	let doc = $state(view.state.doc);

	let toc = $derived(generateToc(doc, levels));

	// Subscribe to editor content changes to update the document
	$effect(() => {
		const unsubscribe = editorContent.subscribe((content) => {
			if (content && view) {
				// Parse the document from the content store to get the latest changes
				doc = getDocFromContent(content);
			}
		});

		return unsubscribe;
	});

	function handleLevelsChange(e: CustomEvent<number[]>) {
		const pos = getPos();
		if (pos === undefined) return;

		view.dispatch(
			view.state.tr.setMeta('addToHistory', false).setNodeMarkup(pos, null, { levels: e.detail })
		);
	}
</script>

<div class="wrap">
	<div class="title" role="heading" aria-level={2}>Table of Contents</div>
	<div class="toc-inner">
		{#if toc.length}
			<TocChildren children={toc} top />
		{:else}
			<IconMessage padding={40} empty iconSize={50} message="No headings found" />
		{/if}
	</div>
	<TocLevels bind:levels on:change={handleLevelsChange} />
</div>

<style>
	.wrap {
		border: 1px solid #ccc;
		border-radius: 5px;
		margin-top: 25px;
		white-space: initial;
	}
	.title {
		padding: 20px 25px;
		font-size: 20px;
		font-weight: 600;
		border-bottom: 1px solid var(--border);
	}
	.toc-inner {
		padding: 20px 25px;
	}
</style>
