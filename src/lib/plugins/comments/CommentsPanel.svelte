<script lang="ts">
	import type { EditorView } from 'prosemirror-view';
	import { tick, onMount } from 'svelte';
	import { getCommentThreads, getComments, replyToComment, resolveComment, type CommentThread } from './commands';
	import type { Comment } from './plugin-comments';

	interface Props {
		view: EditorView;
		updateId: number;
	}

	let { view, updateId }: Props = $props();
	let panel: HTMLDivElement | undefined = $state();
	let itemEls: Record<string, HTMLLIElement> = {};
	let replyDrafts: Record<string, string> = $state({});

	let threads: CommentThread[] = $derived.by(() => {
		updateId;
		return getCommentThreads(view.state);
	});

	let commentsByThread: Map<string, Comment[]> = $derived.by(() => {
		updateId;
		const all = getComments(view.state);
		const map = new Map<string, Comment[]>();
		for (const comment of all) {
			const list = map.get(comment.commentId);
			if (list) list.push(comment);
			else map.set(comment.commentId, [comment]);
		}
		for (const list of map.values()) list.sort((a, b) => a.createdAt - b.createdAt);
		return map;
	});

	function opening(commentId: string): Comment | undefined {
		return commentsByThread.get(commentId)?.find((c) => c.id === c.commentId);
	}

	function replies(commentId: string): Comment[] {
		return (commentsByThread.get(commentId) ?? []).filter((c) => c.id !== c.commentId);
	}

	// the thread whose range is closest to the current selection - kept in
	// sync as the user clicks/moves the cursor around the editor, so the
	// panel always highlights whatever's relevant (same trick as
	// SuggestionsPanel's activeId)
	let activeId: string | null = $derived.by(() => {
		if (threads.length === 0) return null;
		const pos = view.state.selection.head;
		let best = threads[0];
		let bestDistance = distanceToThread(pos, best);
		for (const thread of threads) {
			const distance = distanceToThread(pos, thread);
			if (distance < bestDistance) {
				best = thread;
				bestDistance = distance;
			}
		}
		return best.commentId;
	});

	function distanceToThread(pos: number, thread: CommentThread): number {
		if (pos >= thread.from && pos <= thread.to) return 0;
		return pos < thread.from ? thread.from - pos : pos - thread.to;
	}

	$effect(() => {
		threads;
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
		panel.style.left = editorRect.right + gap + 'px';
	}

	function submitReply(commentId: string) {
		const text = (replyDrafts[commentId] ?? '').trim();
		if (!text) return;
		replyToComment(view, commentId, text);
		replyDrafts[commentId] = '';
	}

	function formatTime(createdAt: number): string {
		return new Date(createdAt).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}
</script>

{#if threads.length > 0}
	<div class="comments-panel" bind:this={panel}>
		<div class="header">
			<span>{threads.length} comment{threads.length === 1 ? '' : 's'}</span>
		</div>
		<ul>
			{#each threads as thread (thread.commentId)}
				{@const root = opening(thread.commentId)}
				<li bind:this={itemEls[thread.commentId]} class:active={thread.commentId === activeId}>
					{#if root}
						<div class="comment">
							<strong>{root.user.name || 'Anonymous'}</strong>
							<span class="time">{formatTime(root.createdAt)}</span>
							<p>{root.text}</p>
						</div>
						{#each replies(thread.commentId) as reply (reply.id)}
							<div class="comment reply">
								<strong>{reply.user.name || 'Anonymous'}</strong>
								<span class="time">{formatTime(reply.createdAt)}</span>
								<p>{reply.text}</p>
							</div>
						{/each}
					{:else}
						<div class="comment loading">Loading comment…</div>
					{/if}

					<div class="reply-row">
						<input
							type="text"
							placeholder="Reply..."
							bind:value={replyDrafts[thread.commentId]}
							onkeydown={(e) => e.key === 'Enter' && submitReply(thread.commentId)}
						/>
						<button class="reply" onclick={() => submitReply(thread.commentId)}>Reply</button>
					</div>
					<div class="actions">
						<button class="resolve" onclick={() => resolveComment(view, thread.commentId)}>Resolve</button>
					</div>
				</li>
			{/each}
		</ul>
	</div>
{/if}

<style>
	.comments-panel {
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
		padding: 10px 12px;
		background: var(--box-background);
		border-bottom: 1px solid var(--border);
		font-weight: 600;
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
		box-shadow: 0 0 0 2px #e0d32e;
	}

	.comment {
		margin-bottom: 6px;
	}

	.comment.reply {
		margin-left: 10px;
		padding-left: 8px;
		border-left: 2px solid var(--border);
	}

	.comment.loading {
		color: var(--text-light);
		font-style: italic;
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

	button:hover {
		background: var(--hover);
	}

	button.resolve {
		border-color: #2e9e5b;
		color: #1a7431;
	}

	button.reply {
		border-color: #e0d32e;
		color: #8a7a12;
	}
</style>
