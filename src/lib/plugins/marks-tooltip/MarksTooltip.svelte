<script lang="ts">
	import type { EditorView } from 'prosemirror-view';
	import { tick, onMount, onDestroy, untrack } from 'svelte';
	import { slide } from 'svelte/transition';
	import { IconButton } from '@hyvor/design/components';
	import IconBoxArrowUpRight from '@hyvor/icons/IconBoxArrowUpRight';
	import IconChatRight from '@hyvor/icons/IconChatRight';
	import IconCode from '@hyvor/icons/IconCode';
	import IconLink45deg from '@hyvor/icons/IconLink45deg';
	import IconPencil from '@hyvor/icons/IconPencil';
	import IconTrash from '@hyvor/icons/IconTrash';
	import IconTypeBold from '@hyvor/icons/IconTypeBold';
	import IconTypeItalic from '@hyvor/icons/IconTypeItalic';
	import IconTypeStrikethrough from '@hyvor/icons/IconTypeStrikethrough';
	import { Mark, type MarkType } from 'prosemirror-model';
	import type { EditorState } from 'prosemirror-state';
	import { toggleMark } from 'prosemirror-commands';
	import LinkSelector from './LinkSelector/LinkSelector.svelte';
	import { markExtend } from './mark-helpers';
	import { suggestionsPluginKey } from '../suggestions/plugin-suggestions';
	import { isCommentingDisabled, resolveComment } from '../suggestions/commands';
	import CommentInput from '../suggestions/CommentInput.svelte';

	interface Props {
		view: EditorView;
		show: boolean;
		updateId: number; // to force update when view is changed
	}

	let { view, show = false, updateId }: Props = $props();

	let tooltip: HTMLSpanElement | undefined = $state();
	let linkSelectorOpen = $state(false);
	let commentInputOpen = $state(false);

	let commentsAvailable = $derived.by(() => {
		updateId;
		return !!suggestionsPluginKey.getState(view.state) && !isCommentingDisabled(view.state);
	});

	function getLink(_: number): Mark | null {
		const sel = view.state.selection;
		let link: Mark | null = null;
		view.state.doc.nodesBetween(sel.from, sel.to, (node, pos) => {
			const mark = view.state.schema.marks.link!.isInSet(node.marks);
			if (mark) {
				link = mark;
			}
		});
		return link;
	}

	let link = $derived(getLink(updateId));

	// comment marks (type "comment" of the suggestion mark) overlapping the
	// selection - several independent comment threads can stack on the same
	// range (see withNodeSuggestion), so this collects all of them, not just one
	function getComments(_: number): Mark[] {
		const sel = view.state.selection;
		const suggestionType = view.state.schema.marks.suggestion;
		if (!suggestionType) return [];
		const found = new Map<string, Mark>();
		view.state.doc.nodesBetween(sel.from, sel.to, (node) => {
			if (!node.isInline) return;
			for (const mark of node.marks) {
				if (mark.type === suggestionType && mark.attrs.type === 'comment') {
					found.set(mark.attrs.id, mark);
				}
			}
		});
		return [...found.values()];
	}

	let comments = $derived(getComments(updateId));

	function getCommentPreview(id: string): string {
		const cache = suggestionsPluginKey.getState(view.state)?.cache;
		const content = cache?.[id]?.comments[0]?.content;
		return content ? getTrimmedText(content) : 'Comment';
	}

	function deleteComment(id: string) {
		resolveComment(view, id);
		view.focus();
	}

	function updatePosition() {
		if (!tooltip) return;

		tooltip.style.display = '';
		const { from, to } = view.state.selection;

		/**
		 * Find the maximum and minimum left points of the current selection
		 * Then, the tooltip is placed in the middle of them
		 */
		let startLeft = Infinity,
			endLeft = 0;
		for (let i = from; i <= to; i++) {
			startLeft = Math.min(startLeft, view.coordsAtPos(i).left);
			endLeft = Math.max(endLeft, view.coordsAtPos(i).left);
		}

		// Find a center-ish x position from the selection endpoints (when
		// crossing lines, end may be more to the left)
		let left = (endLeft - startLeft) / 2;
		const selectionTop = view.coordsAtPos(from).top;
		
		// Position tooltip using fixed positioning relative to viewport
		tooltip.style.left =
			startLeft + left - tooltip.getBoundingClientRect().width / 2 + 'px';
		tooltip.style.top = selectionTop - tooltip.getBoundingClientRect().height - 10 + 'px';
	}

	function isMarkActive(state: EditorState, type: MarkType) {
		const sel = state.selection;
		if (sel.empty) return type.isInSet(state.storedMarks || sel.$from.marks());
		else return state.doc.rangeHasMark(sel.from, sel.to, type);
	}

	// position when show/view is changed
	$effect(() => {
		if (updateId && show) {
			if (untrack(() => commentInputOpen)) {
				commentInputOpen = false;
			}
			(async () => {
				await tick();
				updatePosition();
			})();
		} else if (!show) {
			commentInputOpen = false;
		}
	});

	type MarkName = 'link' | 'strong' | 'em' | 'code' | 'strike' | 'comment';

	function getProps(markName: MarkName) {
		if (markName === 'comment') {
			return { size: 'small', variant: 'invisible', color: 'gray' } as {
				size: 'small';
				variant: 'fill' | 'invisible';
			};
		}
		const markType = view.state.schema.marks[markName]!;
		const isActive = isMarkActive(view.state, markType);
		return {
			size: 'small',
			variant: isActive ? 'fill' : 'invisible',
			color: isActive ? 'accent' : 'gray'
		} as { size: 'small'; variant: 'fill' | 'invisible' };
	}

	async function handleClick(markName: MarkName) {
		if (markName === 'link') {
			linkSelectorOpen = true;
			return;
		}
		if (markName === 'comment') {
			commentInputOpen = true;
			await tick();
			updatePosition();
			return;
		}
		const markType = view.state.schema.marks[markName]!;
		toggleMark(markType)(view.state, view.dispatch, view);
		view.focus();
		show = false;
		await tick();
		show = true;
	}

	function getTrimmedText(text: string) {
		const limit = 100;
		if (text.length > limit) {
			return text.slice(0, limit) + '...';
		}
		return text;
	}

	function deleteLink() {
		if (!link) return;

		const extend = markExtend(view.state.selection.$from, link);

		view.dispatch(view.state.tr.removeMark(extend.from, extend.to, view.state.schema.marks.link));
		view.focus();
	}

	function editLink() {
		linkSelectorOpen = true;
	}

	onMount(() => {
		const handleScroll = () => {
			if (show && tooltip) {
				updatePosition();
			}
		};

		window.addEventListener('scroll', handleScroll, true);
		return () => {
			window.removeEventListener('scroll', handleScroll, true);
		};
	});
</script>

{#key view}
	{#if show}
		<span class="tooltip" bind:this={tooltip}>
			{#if link}
				<div class="link-row">
					<a class="link" target="_blank" rel="noopener noreferrer" href={link.attrs.href}>
						{getTrimmedText(link.attrs.href)}
						<IconBoxArrowUpRight size={12} />
					</a>
					<span class="link-actions">
						<IconButton color="input" size={20} on:click={editLink}>
							<IconPencil size={10} />
						</IconButton>
						<IconButton color="input" size={20} on:click={deleteLink}>
							<IconTrash size={10} />
						</IconButton>
					</span>
				</div>
			{/if}

			{#each comments as comment (comment.attrs.id)}
				<div class="link-row">
					<span class="comment-preview">
						<IconChatRight size={12} />
						{getCommentPreview(comment.attrs.id)}
					</span>
					<span class="link-actions">
						<IconButton color="input" size={20} on:click={() => deleteComment(comment.attrs.id)}>
							<IconTrash size={10} />
						</IconButton>
					</span>
				</div>
			{/each}

			{#if commentInputOpen}
				<div transition:slide={{ duration: 150, axis: 'x' }}>
					<CommentInput
						{view}
						onSubmit={() => (commentInputOpen = false)}
						onCancel={() => (commentInputOpen = false)}
					/>
				</div>
			{:else}
				<div class="buttons-row">
					<IconButton {...getProps('link')} on:click={(e) => handleClick('link')}>
						<IconLink45deg />
					</IconButton>

					<IconButton {...getProps('strong')} on:click={(e) => handleClick('strong')}>
						<IconTypeBold />
					</IconButton>

					<IconButton {...getProps('em')} on:click={(e) => handleClick('em')}>
						<IconTypeItalic />
					</IconButton>

					<IconButton {...getProps('code')} on:click={(e) => handleClick('code')}>
						<IconCode />
					</IconButton>

					<IconButton {...getProps('strike')} on:click={(e) => handleClick('strike')}>
						<IconTypeStrikethrough />
					</IconButton>

					{#if commentsAvailable}
						<span class="mark-separator"></span>
						<IconButton {...getProps('comment')} on:click={(e) => handleClick('comment')}>
							<IconChatRight />
						</IconButton>
					{/if}
				</div>
			{/if}
		</span>
	{/if}
{/key}

{#if linkSelectorOpen}
	<LinkSelector bind:show={linkSelectorOpen} {view} edit={link ? link.attrs.href : undefined} />
{/if}

<style>
	.tooltip {
		position: fixed;
		background: #fff;
		box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
		border-radius: 20px;
		z-index: 1000;
	}

	.tooltip:after {
		content: '';
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		width: 0;
		height: 0;
		border: 5px solid #fff;
		border-bottom-color: transparent;
		position: absolute;
		border-left-color: transparent;
		border-right-color: transparent;
	}

	.link-row {
		margin-bottom: 5px;
		padding: 10px 15px;
		border-bottom: 1px solid var(--border);
		display: flex;
		align-items: center;
	}

	.link {
		display: inline-block;
		color: var(--link);
		font-size: 14px;
		cursor: pointer;
		text-decoration: none !important;
		padding-right: 8px;
		margin-right: 8px;
		border-right: 1px solid var(--border);
		max-width: 250px;
		word-break: break-all;
	}

	.link:hover {
		text-decoration: underline !important;
	}

	.comment-preview {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--text-light);
		font-size: 14px;
		padding-right: 8px;
		margin-right: 8px;
		border-right: 1px solid var(--border);
		max-width: 250px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.buttons-row {
		padding: 10px 15px;
	}
</style>
