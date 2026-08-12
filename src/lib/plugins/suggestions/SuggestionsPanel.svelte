<script lang="ts">
	import type { EditorView } from 'prosemirror-view';
	import { tick, onMount } from 'svelte';
	import {
		getSuggestions,
		acceptSuggestion,
		rejectSuggestion,
		acceptAllSuggestions,
		rejectAllSuggestions,
		type SuggestionItem
	} from './commands';

	interface Props {
		view: EditorView;
		updateId: number;
	}

	let { view, updateId }: Props = $props();
	let panel: HTMLDivElement | undefined = $state();
	let itemEls: Record<string, HTMLLIElement> = {};

	let suggestions: SuggestionItem[] = $derived.by(() => {
		updateId;
		return getSuggestions(view.state);
	});

	// the suggestion whose range is closest to the current selection - kept in
	// sync as the user clicks/moves the cursor around the editor (not just
	// while editing), so the panel always highlights whatever's relevant
	let activeId: string | null = $derived.by(() => {
		if (suggestions.length === 0) return null;
		const pos = view.state.selection.head;
		let best = suggestions[0];
		let bestDistance = distanceToItem(pos, best);
		for (const item of suggestions) {
			const distance = distanceToItem(pos, item);
			if (distance < bestDistance) {
				best = item;
				bestDistance = distance;
			}
		}
		return best.id;
	});

	function distanceToItem(pos: number, item: SuggestionItem): number {
		if (pos >= item.from && pos <= item.to) return 0;
		return pos < item.from ? item.from - pos : pos - item.to;
	}

	$effect(() => {
		// depend on the list (and therefore visibility) so position is
		// recomputed whenever the panel appears/resizes
		suggestions;
		(async () => {
			await tick();
			updatePosition();
		})();
	});

	$effect(() => {
		const id = activeId;
		(async () => {
			await tick();
			itemEls[id ?? '']?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		})();
	});

	onMount(() => {
		const handle = () => updatePosition();
		window.addEventListener('scroll', handle, true);
		window.addEventListener('resize', handle);
		return () => {
			window.removeEventListener('scroll', handle, true);
			window.removeEventListener('resize', handle);
		};
	});

	function updatePosition() {
		if (!panel) return;
		const editorRect = view.dom.getBoundingClientRect();
		const gap = 16;
		panel.style.top = Math.max(12, editorRect.top) + 'px';
		panel.style.left = editorRect.left - panel.offsetWidth - gap + 'px';
	}

	function label(item: SuggestionItem): string {
		const parts: string[] = [];
		if (item.deletedNodeType && item.insertedNodeType) {
			// a whole-node replace (see diff/render.ts) - one grouped suggestion,
			// not a separate delete and insert
			parts.push(
				item.deletedNodeType === item.insertedNodeType
					? `Replaced ${item.deletedNodeType}`
					: `Replaced ${item.deletedNodeType} with ${item.insertedNodeType}`
			);
		} else {
			if (item.deletedNodeType) parts.push(`Deleted ${item.deletedNodeType}`);
			if (item.insertedNodeType) parts.push(`Inserted ${item.insertedNodeType}`);
		}
		if (item.formattedNodeType) parts.push(`Changed ${item.formattedNodeType}`);
		if (item.insertedText) parts.push(`+ "${item.insertedText}"`);
		if (item.deletedText) parts.push(`− "${item.deletedText}"`);
		if (item.formatAdd.length) parts.push(`format +${item.formatAdd.join(', +')}`);
		if (item.formatRemove.length) parts.push(`format −${item.formatRemove.join(', −')}`);
		return parts.join('  ') || 'Change';
	}
</script>

{#if suggestions.length > 0}
	<div class="suggestions-panel" bind:this={panel}>
		<div class="header">
			<span>{suggestions.length} suggestion{suggestions.length === 1 ? '' : 's'}</span>
			{#if suggestions.length > 1}
				<div class="bulk-actions">
					<button class="dismiss" onclick={() => rejectAllSuggestions(view)}>Dismiss all</button>
					<button class="accept" onclick={() => acceptAllSuggestions(view)}>Accept all</button>
				</div>
			{/if}
		</div>
		<ul>
			{#each suggestions as item (item.id)}
				<li bind:this={itemEls[item.id]} class:active={item.id === activeId}>
					<div class="meta">
						{#if item.user.name}<strong>{item.user.name}</strong>{/if}
						<span class="change">{label(item)}</span>
					</div>
					<div class="actions">
						<button class="dismiss" onclick={() => rejectSuggestion(view, item.id)}>Dismiss</button>
						<button class="accept" onclick={() => acceptSuggestion(view, item.id)}>Accept</button>
					</div>
				</li>
			{/each}
		</ul>
	</div>
{/if}

<style>
	.suggestions-panel {
		position: fixed;
		width: 260px;
		max-height: calc(100vh - 40px);
		overflow-y: auto;
		background: var(--box-background);
		border: 1px solid var(--border);
		border-radius: var(--box-radius);
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
		font-size: 13px;
		z-index: 100;
	}

	.header {
		position: sticky;
		top: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 10px 12px;
		background: var(--box-background);
		border-bottom: 1px solid var(--border);
		font-weight: 600;
	}

	.bulk-actions {
		display: flex;
		gap: 6px;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	li {
		padding: 8px 10px;
		background: var(--gray-light);
		border-radius: calc(var(--box-radius) - 4px);
		box-shadow: 0 0 0 0 transparent;
		transition: box-shadow 0.15s ease;
	}

	li.active {
		box-shadow: 0 0 0 2px var(--link);
	}

	.meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-bottom: 6px;
	}

	.meta strong {
		font-size: 12px;
	}

	.change {
		color: var(--text-light);
		word-break: break-word;
	}

	.actions {
		display: flex;
		gap: 6px;
	}

	button {
		flex: 1;
		font-size: 12px;
		font-family: inherit;
		padding: 4px 8px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--box-background);
		cursor: pointer;
		color: var(--text);
	}

	button:hover {
		background: var(--hover);
	}

	button.accept {
		border-color: #2e9e5b;
		color: #1a7431;
	}

	button.dismiss {
		border-color: #d64545;
		color: #a51c2c;
	}
</style>
