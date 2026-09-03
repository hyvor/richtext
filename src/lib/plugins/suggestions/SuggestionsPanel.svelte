<script lang="ts">
	import type { EditorView } from 'prosemirror-view';
	import { tick, onMount } from 'svelte';
	import { TextSelection } from 'prosemirror-state';
	import {
		getSuggestions,
		acceptSuggestion,
		rejectSuggestion,
		acceptAllSuggestions,
		rejectAllSuggestions,
		resolveAllComments,
		replyToSuggestion,
		editSuggestionReply,
		deleteSuggestionReply,
		resolveComment,
		getResolveAuthor,
		getCurrentAuthor,
		isCommentingDisabled,
		type SuggestionItem,
		type SuggestionReply,
		type Author,
		type AuthorInfo
	} from './commands';
	import { slide } from 'svelte/transition';
	import {
		Button,
		IconButton,
		TextInput,
		Tooltip,
		confirm,
		Dropdown,
		ActionList,
		ActionListItem,
		Select
	} from '@hyvor/design/components';
	import IconCheck from '@hyvor/icons/IconCheck';
	import IconX from '@hyvor/icons/IconX';
	import IconChevronDown from '@hyvor/icons/IconChevronDown';
	import IconThreeDotsVertical from '@hyvor/icons/IconThreeDotsVertical';
	import IconPencil from '@hyvor/icons/IconPencil';
	import IconTrash3 from '@hyvor/icons/IconTrash3';

	interface Props {
		view: EditorView;
		updateId: number;
	}

	let { view, updateId }: Props = $props();
	let panel: HTMLDivElement | undefined = $state();
	let itemEls: Record<string, HTMLLIElement> = {};
	let replyDrafts: Record<string, string> = $state({});

	// whether the folded-out extra header UI (bulk actions + author filter)
	// is open - see the folding icon in the header
	let panelOpen = $state(false);
	let filterAuthor: string = $state('all');

	// which reply is currently being edited inline, and its draft text - only
	// one reply can be in edit mode at a time across the whole panel
	let editingReply: { itemId: string; replyId: string } | null = $state(null);
	let editDraft: string = $state('');
	let dropdownOpen: Record<string, boolean> = $state({});

	let items: SuggestionItem[] = $derived.by(() => {
		updateId;
		return getSuggestions(view.state);
	});

	let commentingDisabled = $derived.by(() => {
		updateId;
		return isCommentingDisabled(view.state);
	});

	let suggestionCount = $derived(items.filter((item) => item.type !== 'comment').length);
	let commentCount = $derived(items.filter((item) => item.type === 'comment').length);

	let visibleItems = $derived(
		filterAuthor === 'all' ? items : items.filter((item) => item.author === filterAuthor)
	);

	let authorOptions = $derived.by(() => {
		const seen = new Map<string, string>();
		for (const item of items) {
			if (item.author && !seen.has(item.author)) seen.set(item.author, authorName(item.author));
		}
		return [
			{ value: 'all', label: 'All authors' },
			...[...seen.entries()].map(([value, label]) => ({ value, label }))
		];
	});

	function pluralize(n: number, word: string): string {
		return `${n} ${word}${n === 1 ? '' : 's'}`;
	}

	async function handleAcceptAll() {
		if (suggestionCount === 0) return;
		const confirmed = await confirm({
			title: 'Accept all suggestions',
			content: `Are you sure you want to accept all ${suggestionCount} suggestion${suggestionCount === 1 ? '' : 's'}? This cannot be undone.`,
			confirmText: 'Yes, accept all'
		});
		if (!confirmed) return;
		acceptAllSuggestions(view);
	}

	async function handleRejectAll() {
		if (suggestionCount === 0) return;
		const confirmed = await confirm({
			title: 'Reject all suggestions',
			content: `Are you sure you want to reject all ${suggestionCount} suggestion${suggestionCount === 1 ? '' : 's'}? This cannot be undone.`,
			confirmText: 'Yes, reject all'
		});
		if (!confirmed) return;
		rejectAllSuggestions(view);
	}

	async function handleResolveAll() {
		if (commentCount === 0) return;
		const confirmed = await confirm({
			title: 'Resolve all comments',
			content: `Are you sure you want to resolve all ${commentCount} comment${commentCount === 1 ? '' : 's'}?`,
			confirmText: 'Yes, resolve all'
		});
		if (!confirmed) return;
		resolveAllComments(view);
	}

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

	function getVisibleBounds(el: HTMLElement): { top: number; bottom: number } {
		let top = 0;
		let bottom = window.innerHeight;
		let node = el.parentElement;
		while (node) {
			const overflowY = getComputedStyle(node).overflowY;
			if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'hidden') {
				const rect = node.getBoundingClientRect();
				top = Math.max(top, rect.top);
				bottom = Math.min(bottom, rect.bottom);
			}
			node = node.parentElement;
		}
		return { top, bottom };
	}

	function updatePosition() {
		if (!panel) return;
		const editorRect = view.dom.getBoundingClientRect();
		const gap = 16;
		const margin = 12;
		const visible = getVisibleBounds(view.dom);

		const top = Math.max(margin, editorRect.top, visible.top);
		const bottom = Math.min(window.innerHeight - margin, editorRect.bottom, visible.bottom);

		// prefer sitting to the left of the editor (the common case - most
		// hosts give it a wide margin there), but that assumes ~300px of
		// spare room, which a centered modal usually doesn't have - fall back
		// to the right of the editor, then to hugging whichever edge is
		// closest, rather than rendering mostly off-screen and unclickable
		const panelWidth = panel.offsetWidth;
		const leftOfEditor = editorRect.left - panelWidth - gap;
		const rightOfEditor = editorRect.right + gap;
		let left: number;
		if (leftOfEditor >= margin) {
			left = leftOfEditor;
		} else if (rightOfEditor + panelWidth <= window.innerWidth - margin) {
			left = rightOfEditor;
		} else {
			left = Math.max(margin, leftOfEditor);
		}

		panel.style.top = top + 'px';
		panel.style.left = left + 'px';
		panel.style.maxHeight = Math.max(0, bottom - top) + 'px';
	}

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

		const inserted = item.insertedText || item.insertedNodeText || item.insertedNodeType;
		const deleted = item.deletedText || item.deletedNodeText || item.deletedNodeType;

		if (inserted && deleted) {
			return {
				kind: 'replace',
				prefix: 'Replace',
				from: truncate(deleted),
				to: truncate(inserted)
			};
		}
		if (inserted) {
			return { kind: 'quoted', prefix: 'Insert', text: truncate(inserted) };
		}
		if (deleted) {
			return { kind: 'quoted', prefix: 'Delete', text: truncate(deleted) };
		}
		return null;
	}

	let authorCache: Record<string, AuthorInfo> = $state({});
	let authorPending = new Set<string>();

	function authorInfo(author: Author | null): AuthorInfo | null {
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

	function isMine(author: Author): boolean {
		return getCurrentAuthor(view.state) === author;
	}

	function startEdit(itemId: string, reply: SuggestionReply) {
		editingReply = { itemId, replyId: reply.id };
		editDraft = reply.content;
		dropdownOpen[reply.id] = false;
	}

	function cancelEdit() {
		editingReply = null;
		editDraft = '';
	}

	function saveEdit(item: SuggestionItem) {
		if (!editingReply) return;
		const text = editDraft.trim();
		if (!text) return;
		editSuggestionReply(view, item.id, editingReply.replyId, text);
		editingReply = null;
		editDraft = '';
	}

	async function confirmDeleteReply(item: SuggestionItem, reply: SuggestionReply) {
		dropdownOpen[reply.id] = false;
		const confirmed = await confirm({
			title: 'Delete reply',
			content: 'Are you sure you want to delete this reply? This cannot be undone.',
			confirmText: 'Yes, delete'
		});
		if (!confirmed) return;
		deleteSuggestionReply(view, item.id, reply.id);
	}

	// centers the given doc position in the editor's viewport - native
	// Element.scrollIntoView() rather than prosemirror-view's own
	// tr.scrollIntoView(), which only scrolls the minimum distance needed to
	// bring the selection on-screen (leaving it sitting right at the edge)
	function scrollPosIntoView(pos: number) {
		let node: globalThis.Node | null = view.domAtPos(pos).node;
		while (node && node.nodeType !== Node.ELEMENT_NODE) node = node.parentNode;
		(node as HTMLElement | null)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
	}

	function jumpTo(item: SuggestionItem) {
		const tr = view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(item.from)));
		view.dispatch(tr);
		view.focus();
		scrollPosIntoView(item.from);
	}

	// wraps an accept/reject/resolve action so that, once it's moved the
	// selection to whatever suggestion/comment comes next (see
	// focusAdjacentItem in commands.ts), the editor scrolls to reveal it too -
	// same "center in view" treatment as clicking an item directly (jumpTo),
	// just without stealing focus from wherever the user clicked (a panel
	// button, not the document)
	function resolveAndAdvance(action: () => void) {
		action();
		scrollPosIntoView(view.state.selection.head);
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

{#snippet authorRow(author: Author | null, timestamp?: number | null)}
	<div class="author-row">
		{@render avatar(author)}
		<div class="right">
			<strong>{authorName(author)}</strong>
			{#if timestamp}
				<span class="time">{formatTime(timestamp)}</span>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet actionButtons(item: SuggestionItem)}
	<Tooltip text={item.type === 'comment' ? 'Resolve comment' : 'Accept suggestion'} delay={500}>
		<IconButton
			size={18}
			onclick={() =>
				resolveAndAdvance(() =>
					item.type === 'comment' ? resolveComment(view, item.id) : acceptSuggestion(view, item.id)
				)}
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
				onclick={() => resolveAndAdvance(() => rejectSuggestion(view, item.id))}
				style="color:var(--red-dark)"
			>
				<IconX size={12} />
			</IconButton>
		</Tooltip>
	{/if}
{/snippet}

{#snippet replyActions(item: SuggestionItem, reply: SuggestionReply, isPrimary: boolean)}
	<div class="entry-actions" onclick={(e) => e.stopPropagation()}>
		{#if isMine(reply.author)}
			<Dropdown
				bind:show={() => dropdownOpen[reply.id] ?? false, (v) => (dropdownOpen[reply.id] = v)}
				position="left"
				align="end"
				width={140}
			>
				{#snippet trigger()}
					<button class="dots-btn" aria-label="Reply actions">
						<IconThreeDotsVertical size={12} />
					</button>
				{/snippet}
				{#snippet content()}
					<ActionList>
						<ActionListItem on:click={() => startEdit(item.id, reply)}>
							{#snippet start()}<IconPencil size={12} />{/snippet}
							Edit
						</ActionListItem>
						<ActionListItem type="danger" on:click={() => confirmDeleteReply(item, reply)}>
							{#snippet start()}<IconTrash3 size={12} />{/snippet}
							Delete
						</ActionListItem>
					</ActionList>
				{/snippet}
			</Dropdown>
		{/if}
		{#if isPrimary}
			{@render actionButtons(item)}
		{/if}
	</div>
{/snippet}

{#if items.length > 0 && view.editable}
	<div class="suggestions-panel" bind:this={panel}>
		<div class="header-wrap" class:open={panelOpen}>
			<button class="header" onclick={() => (panelOpen = !panelOpen)}>
				<span>{pluralize(suggestionCount, 'suggestion')}, {pluralize(commentCount, 'comment')}</span
				>
				<span class="fold-icon" class:open={panelOpen}>
					<IconChevronDown size={12} />
				</span>
			</button>
			{#if panelOpen}
				<div class="header-extra" transition:slide={{ duration: 150 }}>
					<div class="extra-group">
						<span class="extra-label">Suggestions</span>
						<div class="extra-actions">
							<button class="extra-btn" disabled={suggestionCount === 0} onclick={handleAcceptAll}>
								Accept all
							</button>
							<button
								class="extra-btn danger"
								disabled={suggestionCount === 0}
								onclick={handleRejectAll}
							>
								Reject all
							</button>
						</div>
					</div>
					<div class="extra-group">
						<span class="extra-label">Comments</span>
						<div class="extra-actions">
							<button class="extra-btn" disabled={commentCount === 0} onclick={handleResolveAll}>
								Resolve all
							</button>
						</div>
					</div>
					<div class="extra-group">
						<span class="extra-label">Filter by author</span>
						<Select bind:value={filterAuthor} options={authorOptions} size="small" block />
					</div>
				</div>
			{/if}
		</div>
		<ul>
			{#each visibleItems as item (item.id)}
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
									<div class="entry-row">
										{@render authorRow(item.author, item.timestamp)}
										<div class="entry-actions" onclick={(e) => e.stopPropagation()}>
											{@render actionButtons(item)}
										</div>
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

							{#each item.comments as comment, i (comment.id)}
								{@const isPrimary = item.type === 'comment' && i === 0}
								{@const isEditing =
									editingReply?.itemId === item.id && editingReply?.replyId === comment.id}
								<div class="comment">
									<div class="entry-row">
										{@render authorRow(comment.author, comment.timestamp)}
										{@render replyActions(item, comment, isPrimary)}
									</div>
									{#if isEditing}
										<div class="edit-row" onclick={(e) => e.stopPropagation()}>
											<TextInput
												type="text"
												size="small"
												bind:value={editDraft}
												onkeydown={(e) => {
													e.stopPropagation();
													if (e.key === 'Enter') saveEdit(item);
													if (e.key === 'Escape') cancelEdit();
												}}
											/>
											<Button size="x-small" color="gray" onclick={cancelEdit}>Cancel</Button>
											<Button size="x-small" onclick={() => saveEdit(item)}>Save</Button>
										</div>
									{:else}
										<div class="comment-content">{comment.content}</div>
									{/if}
								</div>
							{/each}
						</div>

						{#if item.id === activeId && !commentingDisabled}
							<div class="reply-row" transition:slide={{ duration: 150 }}>
								<TextInput
									type="text"
									placeholder="Reply..."
									bind:value={replyDrafts[item.id]}
									size="small"
									onkeydown={(e) => {
										e.stopPropagation();
										e.key === 'Enter' && submitReply(item);
									}}
									onclick={(e) => e.stopPropagation()}
								/>
								<Button size="x-small" onclick={() => submitReply(item)}>Reply</Button>
							</div>
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
		font-size: 13px;
		z-index: 100;
	}

	.header-wrap {
		position: sticky;
		top: 0;
		z-index: 1;
		margin: 0 4px;
		border-radius: 20px;
		transition:
			background-color 0.15s ease,
			box-shadow 0.15s ease;
		background: var(--box-background);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
	}

	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		font-weight: 600;
		width: 100%;
		padding: 10px 20px;
	}

	.fold-icon {
		display: inline-flex;
		transition: transform 0.15s ease;
	}

	.fold-icon.open {
		transform: rotate(180deg);
	}

	.header-extra {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 10px 20px;
		padding-top: 0;
	}

	.extra-group {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.extra-label {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--text-light);
	}

	.extra-actions {
		display: flex;
		gap: 6px;
	}

	.extra-btn {
		font-size: 11px;
		font-weight: 600;
		padding: 4px 8px;
		border-radius: 6px;
		color: var(--green-dark);
	}

	.extra-btn.danger {
		color: var(--red-dark);
	}

	.extra-btn:hover:not(:disabled) {
		background: var(--hover);
	}

	.extra-btn:disabled {
		opacity: 0.4;
		cursor: default;
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
		padding: 12px 16px;
		cursor: pointer;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
		transition: box-shadow 0.15s ease;
	}

	li.active .item-wrap {
		box-shadow: 0 0 0 2px var(--accent);
	}
	.item-wrap:hover {
		background: var(--hover);
	}

	.meta {
		margin-bottom: 6px;
	}

	.entry-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
	}

	.entry-actions {
		display: flex;
		align-items: center;
		gap: 2px;
		flex-shrink: 0;
	}

	.dots-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border-radius: 5px;
		color: var(--text-light);
	}

	.dots-btn:hover {
		background: var(--hover);
		color: var(--text);
	}

	.author-row {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 6px;
	}

	.author-row .right {
		display: flex;
		flex-direction: column;
		line-height: 12px;
	}

	.author-row strong {
		font-size: 11px;
	}

	.author-row .time {
		font-size: 10px;
		color: var(--text-light);
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
		margin-bottom: 10px;
	}

	.comment-content {
		margin: 2px 0 0 0;
		word-break: break-word;
	}

	.edit-row {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 4px;
	}

	.reply-row {
		display: flex;
		gap: 6px;
		margin-top: 6px;
	}
</style>
