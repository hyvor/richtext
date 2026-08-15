<script lang="ts">
	import type { EditorView } from 'prosemirror-view';
	import { tick, onMount } from 'svelte';
	import { TextSelection } from 'prosemirror-state';
	import {
		getSuggestions,
		acceptSuggestion,
		rejectSuggestion,
		replyToSuggestion,
		resolveComment,
		getResolveAuthor,
		type SuggestionItem,
		type Author,
		type AuthorInfo
	} from './commands';
	// bulk actions temporarily disabled, see the header below
	// import { acceptAllSuggestions, rejectAllSuggestions } from './commands';

	interface Props {
		view: EditorView;
		updateId: number;
	}

	let { view, updateId }: Props = $props();
	let panel: HTMLDivElement | undefined = $state();
	let itemEls: Record<string, HTMLLIElement> = {};
	let replyDrafts: Record<string, string> = $state({});

	let items: SuggestionItem[] = $derived.by(() => {
		updateId;
		return getSuggestions(view.state);
	});

	// the item whose range is closest to the current selection - kept in sync
	// as the user clicks/moves the cursor around the editor (not just while
	// editing), so the panel always highlights whatever's relevant
	let activeId: string | null = $derived.by(() => {
		if (items.length === 0) return null;
		const pos = view.state.selection.head;
		let best = items[0];
		let bestDistance = distanceToItem(pos, best);
		for (const item of items) {
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
		items;
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

	// author display name resolution - cached locally since resolveAuthor may
	// be async (e.g. a network lookup); shows a "…" placeholder meanwhile
	let authorCache: Record<string, AuthorInfo> = $state({});
	let authorPending = new Set<string>();

	function authorName(author: Author): string {
		const cached = authorCache[author];
		if (cached) return cached.name;
		if (!authorPending.has(author)) {
			authorPending.add(author);
			const resolveAuthor = getResolveAuthor(view.state);
			Promise.resolve(resolveAuthor(author)).then((info) => {
				authorCache[author] = info;
				authorPending.delete(author);
			});
		}
		return '…';
	}

	function formatTime(timestamp: number): string {
		return new Date(timestamp).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function submitReply(item: SuggestionItem) {
		const text = (replyDrafts[item.id] ?? '').trim();
		if (!text) return;
		replyToSuggestion(view, item.id, text);
		replyDrafts[item.id] = '';
	}

	// Clicking an item's content (not its buttons/reply input) moves the
	// editor's selection to its range and scrolls the editor to reveal it -
	// the reverse direction of activeId/itemEls[...].scrollIntoView above,
	// which only keeps the panel's own list in sync with the editor
	// selection, not the other way around.
	function jumpTo(item: SuggestionItem) {
		const tr = view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(item.from)));
		view.dispatch(tr.scrollIntoView());
		view.focus();
	}

	function jumpToOnKey(e: KeyboardEvent, item: SuggestionItem) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			jumpTo(item);
		}
	}
</script>

{#if items.length > 0}
	<div class="suggestions-panel" bind:this={panel}>
		<div class="header">
			<span>{items.length} suggestion{items.length === 1 ? '' : 's'}</span>
			<!--
			bulk actions removed for now
			{#if items.length > 1}
				<div class="bulk-actions">
					<button class="dismiss" onclick={() => rejectAllSuggestions(view)}>Dismiss all</button>
					<button class="accept" onclick={() => acceptAllSuggestions(view)}>Accept all</button>
				</div>
			{/if}
			-->
		</div>
		<ul>
			{#each items as item (item.id)}
				<li bind:this={itemEls[item.id]} class:active={item.id === activeId}>
					{#if item.type === 'comment'}
						{@const opener = item.comments[0]}
						<div
							class="content"
							role="button"
							tabindex="0"
							onclick={() => jumpTo(item)}
							onkeydown={(e) => jumpToOnKey(e, item)}
						>
							{#if opener}
								<div class="comment">
									<strong>{authorName(opener.author)}</strong>
									<span class="time">{formatTime(opener.timestamp)}</span>
									<p>{opener.content}</p>
								</div>
							{/if}
							{#each item.comments.slice(1) as reply (reply.id)}
								<div class="comment reply">
									<strong>{authorName(reply.author)}</strong>
									<span class="time">{formatTime(reply.timestamp)}</span>
									<p>{reply.content}</p>
								</div>
							{/each}
						</div>
					{:else}
						<div
							class="content"
							role="button"
							tabindex="0"
							onclick={() => jumpTo(item)}
							onkeydown={(e) => jumpToOnKey(e, item)}
						>
							<div class="meta">
								<strong>{authorName(item.author)}</strong>
								<span class="change">{label(item)}</span>
							</div>
							{#each item.comments as reply (reply.id)}
								<div class="comment reply">
									<strong>{authorName(reply.author)}</strong>
									<span class="time">{formatTime(reply.timestamp)}</span>
									<p>{reply.content}</p>
								</div>
							{/each}
						</div>
					{/if}

					<div class="reply-row">
						<input
							type="text"
							placeholder="Reply..."
							bind:value={replyDrafts[item.id]}
							onkeydown={(e) => e.key === 'Enter' && submitReply(item)}
						/>
						<button class="reply" onclick={() => submitReply(item)}>Reply</button>
					</div>

					<div class="actions">
						{#if item.type === 'comment'}
							<button class="resolve" onclick={() => resolveComment(view, item.id)}>Resolve</button>
						{:else}
							<button class="dismiss" onclick={() => rejectSuggestion(view, item.id)}>Dismiss</button>
							<button class="accept" onclick={() => acceptSuggestion(view, item.id)}>Accept</button>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	</div>
{/if}

<style>
	.suggestions-panel {
		position: fixed;
		width: 280px;
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
		gap: 8px;
	}

	/* floating "chat bubble" look - no flat fill, just enough definition
	   (border + shadow) to read as a card sitting on the panel's surface */
	li {
		padding: 8px 10px;
		border: 1px solid var(--border);
		border-radius: calc(var(--box-radius) - 4px);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
		transition: box-shadow 0.15s ease;
	}

	li.active {
		box-shadow: 0 0 0 2px var(--link);
	}

	.content {
		cursor: pointer;
		border-radius: 4px;
	}

	.content:hover {
		background: var(--hover);
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

	.comment {
		margin-bottom: 6px;
	}

	.comment.reply {
		margin-left: 10px;
		padding-left: 8px;
		border-left: 2px solid var(--border);
	}

	.comment strong {
		font-size: 12px;
	}

	.comment .time {
		color: var(--text-light);
		font-size: 11px;
		margin-left: 6px;
	}

	.comment p {
		margin: 2px 0 0 0;
		word-break: break-word;
	}

	.reply-row {
		display: flex;
		gap: 6px;
		margin-top: 6px;
	}

	.reply-row input {
		flex: 1;
		min-width: 0;
		font-size: 12px;
		font-family: inherit;
		padding: 4px 8px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--box-background);
		color: var(--text);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 6px;
		margin-top: 6px;
	}

	button {
		font-size: 12px;
		font-family: inherit;
		padding: 4px 8px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--box-background);
		cursor: pointer;
		color: var(--text);
	}

	.actions button {
		flex: 1;
	}

	button:hover {
		background: var(--hover);
	}

	button.accept,
	button.resolve {
		border-color: #2e9e5b;
		color: #1a7431;
	}

	button.dismiss {
		border-color: #d64545;
		color: #a51c2c;
	}

	button.reply {
		border-color: #e0d32e;
		color: #8a7a12;
	}
</style>
