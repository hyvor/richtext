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
	import { slide } from 'svelte/transition';
	import { IconButton, Tooltip } from '@hyvor/design/components';
	import IconCheck from '@hyvor/icons/IconCheck';
	import IconX from '@hyvor/icons/IconX';
	// bulk actions temporarily disabled, see the header below
	// import { acceptAllSuggestions, rejectAllSuggestions } from './command size={12}s';

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

	function authorName(author: Author | null): string {
		// null: the host's SuggestionSource (see plugin-suggestions.ts) hasn't
		// resolved this suggestion's author yet - distinct from "resolveAuthor
		// pending", but shows the same placeholder either way
		if (author === null) return '…';
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
					<div
						class="item-wrap hds-box"
						onclick={() => jumpTo(item)}
						onkeydown={(e) => jumpToOnKey(e, item)}
						role="button"
						tabindex="0"
					>
						<div class="content">
							{#if item.type !== 'comment'}
								<div class="meta">
									<strong>{authorName(item.author)}</strong>
									<span class="change">{label(item)}</span>
								</div>
							{/if}
							{#each item.comments as comment (comment.id)}
								<div class="comment">
									<strong>{authorName(comment.author)}</strong>
									<span class="time">{formatTime(comment.timestamp)}</span>
									<div class="comment-content">{comment.content}</div>
								</div>
							{/each}
						</div>

						{#if item.id === activeId}
							<div class="reply-row" transition:slide>
								<input
									type="text"
									placeholder="Reply..."
									bind:value={replyDrafts[item.id]}
									onkeydown={(e) => {
										e.stopPropagation();
										e.key === 'Enter' && submitReply(item);
									}}
									onclick={(e) => e.stopPropagation()}
								/>
								<button class="reply" onclick={() => submitReply(item)}>Reply</button>
							</div>
						{/if}

						<div class="actions">
							<Tooltip
								text={item.type === 'comment' ? 'Resolve comment' : 'Accept suggestion'}
								delay={500}
							>
								<IconButton
									size={18}
									onclick={() =>
										item.type === 'comment'
											? resolveComment(view, item.id)
											: acceptSuggestion(view, item.id)}
									color="input"
									style="color:var(--green-dark)"
								>
									<IconCheck size={12} />
								</IconButton>
							</Tooltip>

							{#if item.type !== 'comment'}
								<Tooltip text={'Dismiss suggestion'} delay={500}>
									<IconButton
										size={18}
										color="input"
										onclick={() => rejectSuggestion(view, item.id)}
										style="color:var(--red-dark)"
									>
										<IconX size={12} />
									</IconButton>
								</Tooltip>
							{/if}
						</div>
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
		font-size: 13px;
		z-index: 100;
	}

	.header {
		position: sticky;
		top: 0;
		gap: 8px;
		padding: 4px 12px;
		font-weight: 600;
		text-align: right;
	}

	.bulk-actions {
		display: flex;
		gap: 6px;
	}

	ul {
		list-style: none;
		margin: 0 !important;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.item-wrap {
		padding: 8px 16px;
		cursor: pointer;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
		transition: box-shadow 0.15s ease;
		position: relative;
	}

	li.active .item-wrap {
		box-shadow: 0 0 0 2px var(--accent);
	}
	.item-wrap:hover {
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
		margin-top: 6px;
	}

	.change {
		color: var(--text-light);
		word-break: break-word;
	}

	.comment {
		margin-bottom: 6px;
	}

	.comment strong {
		font-size: 12px;
	}

	.comment .time {
		color: var(--text-light);
		font-size: 11px;
		margin-left: 6px;
	}

	.comment-content {
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
		position: absolute;
		top: 12px;
		right: 12px;
	}
</style>
