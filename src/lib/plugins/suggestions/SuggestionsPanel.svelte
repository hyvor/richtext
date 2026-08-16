<script lang="ts">
	import type { EditorView } from 'prosemirror-view';
	import { tick, onMount } from 'svelte';
	import { TextSelection } from 'prosemirror-state';
	import {
		getSuggestions,
		acceptSuggestion,
		rejectSuggestion,
		acceptAllSuggestions,
		replyToSuggestion,
		resolveComment,
		getResolveAuthor,
		type SuggestionItem,
		type Author,
		type AuthorInfo
	} from './commands';
	import { slide } from 'svelte/transition';
	import { IconButton, Tooltip, confirm } from '@hyvor/design/components';
	import IconCheck from '@hyvor/icons/IconCheck';
	import IconX from '@hyvor/icons/IconX';

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

	// comments aren't "suggestions" for accept-all purposes (acceptAllSuggestions
	// itself skips them too, see commands.ts) - only count/offer the button for
	// actual tracked-change items
	let suggestionCount = $derived(items.filter((item) => item.type !== 'comment').length);

	async function handleAcceptAll() {
		const confirmed = await confirm({
			title: 'Accept all suggestions',
			content: `Are you sure you want to accept all ${suggestionCount} suggestion${suggestionCount === 1 ? '' : 's'}? This cannot be undone.`,
			confirmText: 'Yes, accept all'
		});
		if (!confirmed) return;
		acceptAllSuggestions(view);
	}

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

	// "quoted": prefix + one italic "text" (plain insert or delete).
	// "replace": prefix + two italic "text"s joined by "with" (a word-level or
	// whole-node replace - see plugin-suggestions.ts's handleReplaceStep and
	// diff/render.ts's 'replace' case, both of which reuse one suggestion id
	// across the deleted and inserted halves, so they land in the same item
	// here - see getSuggestions() in commands.ts).
	// "plain": prefix + a description with no quoting/italics (format).
	type ChangeDescription =
		| { kind: 'quoted'; prefix: string; text: string }
		| { kind: 'replace'; prefix: string; from: string; to: string }
		| { kind: 'plain'; prefix: string; text: string };

	const CHANGE_TEXT_MAX = 40;

	function truncate(text: string, max = CHANGE_TEXT_MAX): string {
		return text.length <= max ? text : text.slice(0, max).trimEnd() + '…';
	}

	function describeChange(item: SuggestionItem): ChangeDescription | null {
		if (item.formatAdd.length || item.formatRemove.length) {
			const parts = [
				...item.formatAdd.map((m) => `add ${m}`),
				...item.formatRemove.map((m) => `remove ${m}`)
			];
			return { kind: 'plain', prefix: 'Format', text: parts.join(', ') };
		}
		if (item.formattedNodeType) {
			return { kind: 'plain', prefix: 'Format', text: item.formattedNodeType };
		}

		// prefer a content preview (the node's own text, e.g. a paragraph's
		// text) over the bare type name, so "Insert: paragraph" reads as
		// "Insert: "this is new content..."" instead - falls back to the type
		// name only for nodes with no text of their own (image, audio, ...)
		const inserted = item.insertedText || item.insertedNodeText || item.insertedNodeType;
		const deleted = item.deletedText || item.deletedNodeText || item.deletedNodeType;

		if (inserted && deleted) {
			return { kind: 'replace', prefix: 'Replace', from: truncate(deleted), to: truncate(inserted) };
		}
		if (inserted) {
			return { kind: 'quoted', prefix: 'Insert', text: truncate(inserted) };
		}
		if (deleted) {
			return { kind: 'quoted', prefix: 'Delete', text: truncate(deleted) };
		}
		return null;
	}

	// author display name/picture resolution - cached locally since
	// resolveAuthor may be async (e.g. a network lookup); returns null (shown
	// as a "…" placeholder) meanwhile
	let authorCache: Record<string, AuthorInfo> = $state({});
	let authorPending = new Set<string>();

	function authorInfo(author: Author | null): AuthorInfo | null {
		// null: the host's SuggestionSource (see plugin-suggestions.ts) hasn't
		// resolved this suggestion's author yet - distinct from "resolveAuthor
		// pending", but shows the same placeholder either way
		if (author === null) return null;
		const cached = authorCache[author];
		if (cached) return cached;
		if (!authorPending.has(author)) {
			authorPending.add(author);
			const resolveAuthor = getResolveAuthor(view.state);
			Promise.resolve(resolveAuthor(author)).then((info) => {
				authorCache[author] = info;
				authorPending.delete(author);
			});
		}
		return null;
	}

	function authorName(author: Author | null): string {
		return authorInfo(author)?.name ?? '…';
	}

	// deterministic per-name color for the initials avatar fallback, so the
	// same author always gets the same color instead of a random one on every
	// render
	function avatarColor(seed: string): string {
		let hash = 0;
		for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
		return `hsl(${Math.abs(hash) % 360}, 55%, 42%)`;
	}

	function initials(name: string): string {
		const words = name.trim().split(/\s+/).filter(Boolean);
		if (words.length === 0) return '?';
		if (words.length === 1) return words[0]!.slice(0, 1).toUpperCase();
		return (words[0]!.slice(0, 1) + words[words.length - 1]!.slice(0, 1)).toUpperCase();
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
	// selection, not the other way around. Focus must happen BEFORE dispatch:
	// prosemirror-view's scrollToSelection() reads the *current* DOM selection
	// to know what to scroll to, but selectionToDOM() only writes the new
	// selection into the DOM if the view already owns focus at dispatch time
	// (editorOwnsSelection() in prosemirror-view) - otherwise it's silently
	// skipped. Dispatching before focusing means the browser's selection is
	// still stale (or outside the editor) when scrollToSelection() runs, so it
	// either scrolls to the wrong place or no-ops - the cursor still lands
	// correctly once view.focus() runs afterward (it syncs the DOM selection
	// itself), just without ever scrolling.
	function jumpTo(item: SuggestionItem) {
		view.focus();
		const tr = view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(item.from)));
		view.dispatch(tr.scrollIntoView());
	}

	function jumpToOnKey(e: KeyboardEvent, item: SuggestionItem) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			jumpTo(item);
		}
	}
</script>

{#snippet avatar(author: Author | null)}
	{@const info = authorInfo(author)}
	{@const seed = info?.name ?? author ?? '?'}
	<span class="avatar" style:background-color={info?.picture ? undefined : avatarColor(seed)}>
		{#if info?.picture}
			<img src={info.picture} alt="" />
		{:else}
			{initials(seed)}
		{/if}
	</span>
{/snippet}

{#if items.length > 0 && view.editable}
	<div class="suggestions-panel" bind:this={panel}>
		<div class="header">
			<span>{items.length} suggestion{items.length === 1 ? '' : 's'}</span>
			{#if suggestionCount > 0}
				<button class="accept-all" onclick={handleAcceptAll}>Accept all</button>
			{/if}
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
								{@const change = describeChange(item)}
								<div class="meta">
									<div class="author-row">
										{@render avatar(item.author)}
										<strong>{authorName(item.author)}</strong>
									</div>
									{#if change}
										<span class="change"
											>{change.prefix}:
											{#if change.kind === 'replace'}
												<em>"{change.from}"</em> with <em>"{change.to}"</em>
											{:else if change.kind === 'quoted'}
												<em>"{change.text}"</em>
											{:else}
												{change.text}
											{/if}</span
										>
									{/if}
								</div>
							{/if}
							{#each item.comments as comment (comment.id)}
								<div class="comment">
									<div class="author-row">
										{@render avatar(comment.author)}
										<strong>{authorName(comment.author)}</strong>
										<span class="time">{formatTime(comment.timestamp)}</span>
									</div>
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
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 4px 8px 4px 12px;
		font-weight: 600;
		background: var(--box-background);
	}

	.accept-all {
		font-size: 11px;
		font-weight: 600;
		padding: 4px 8px;
		border-radius: 6px;
		color: var(--green-dark);
	}

	.accept-all:hover {
		background: var(--hover);
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
		gap: 4px;
		margin-bottom: 6px;
	}

	.author-row {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 6px;
	}

	.author-row strong {
		font-size: 12px;
	}

	.avatar {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		overflow: hidden;
		font-size: 8px;
		font-weight: 700;
		color: #fff;
		letter-spacing: 0.02em;
	}

	.avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.change {
		color: var(--text-light);
		word-break: break-word;
	}

	.change em {
		font-style: italic;
	}

	.comment {
		margin-bottom: 6px;
	}

	.comment .time {
		color: var(--text-light);
		font-size: 11px;
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
