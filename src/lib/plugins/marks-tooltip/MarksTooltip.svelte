<script lang="ts">
	import type { EditorView } from 'prosemirror-view';
	import { tick, onMount, onDestroy } from 'svelte';
	import { IconButton } from '@hyvor/design/components';
	import IconBoxArrowUpRight from '@hyvor/icons/IconBoxArrowUpRight';
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

	interface Props {
		view: EditorView;
		show: boolean;
		updateId: number; // to force update when view is changed
	}

	let { view, show = false, updateId }: Props = $props();

	let tooltip: HTMLSpanElement | undefined = $state();
	let linkSelectorOpen = $state(false);

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
			(async () => {
				await tick();
				updatePosition();
			})();
		}
	});

	type MarkName = 'link' | 'strong' | 'em' | 'code' | 'strike' | 'comment';

	function getProps(markName: MarkName) {
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
		const markType = view.state.schema.marks[markName]!;
		toggleMark(markType)(view.state, view.dispatch, view);
		view.focus();
		show = false;
		await tick();
		show = true;
	}

	function getTrimmedLink(link: string) {
		const limit = 100;
		if (link.length > limit) {
			return link.slice(0, limit) + '...';
		}
		return link;
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
						{getTrimmedLink(link.attrs.href)}
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

			<div class="buttons-row">
				<IconButton {...getProps('link')} on:click={() => handleClick('link')}>
					<IconLink45deg />
				</IconButton>

				<IconButton {...getProps('strong')} on:click={() => handleClick('strong')}>
					<IconTypeBold />
				</IconButton>

				<IconButton {...getProps('em')} on:click={() => handleClick('em')}>
					<IconTypeItalic />
				</IconButton>

				<IconButton {...getProps('code')} on:click={() => handleClick('code')}>
					<IconCode />
				</IconButton>

				<IconButton {...getProps('strike')} on:click={() => handleClick('strike')}>
					<IconTypeStrikethrough />
				</IconButton>

				<!-- <IconButton {...getProps('comment')} on:click={() => handleClick('comment')}>
					<IconChatRight />
				</IconButton> -->
			</div>
		</span>
	{/if}
{/key}

{#if linkSelectorOpen}
	<LinkSelector bind:show={linkSelectorOpen} {view} edit={link ? link.attrs.href : null} />
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

	.buttons-row {
		padding: 10px 15px;
	}
</style>
