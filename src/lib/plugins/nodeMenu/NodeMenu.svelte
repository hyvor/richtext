<script lang="ts">
	import { onMount, tick } from 'svelte';
	import {
		ActionList,
		ActionListItem,
		Dropdown,
		IconButton,
		Tooltip
	} from '@hyvor/design/components';
	import IconCopy from '@hyvor/icons/IconCopy';
	import IconTrash from '@hyvor/icons/IconTrash';
	import type { EditorView } from 'prosemirror-view';
	import { NodeSelection } from 'prosemirror-state';
	import IconGripVertical from '@hyvor/icons/IconGripVertical';
	import IconChatRight from '@hyvor/icons/IconChatRight';
	import { deleteNode, moveNode, nodeMenuPos, topLevelBlockPosAt } from './node-menu';
	import { suggestionsPluginKey } from '../suggestions/plugin-suggestions';
	import CommentComposer from '../suggestions/CommentComposer.svelte';

	interface Props {
		view: EditorView;
	}

	let { view }: Props = $props();

	let show = $state(false);
	let commentComposerOpen = $state(false);

	// static for the editor's lifetime - the suggestions plugin is either
	// installed at creation or not (see src/lib/plugins/suggestions)
	const commentsAvailable = !!suggestionsPluginKey.getState(view.state);

	function onComment() {
		if ($nodeMenuPos === null) return;
		const pos = $nodeMenuPos;
		if (!view.state.doc.nodeAt(pos)) return;
		view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
		show = false;
		commentComposerOpen = true;
	}
	let wrapEl: HTMLSpanElement | undefined = $state();

	// how far the pointer needs to move (in px) before a mousedown on the
	// handle turns into a drag, so a plain click still opens the menu
	const DRAG_THRESHOLD = 4;
	// scroll-edge trigger zone, in px from the top/bottom of the viewport
	const AUTOSCROLL_MARGIN = 60;

	let dragging = $state(false);
	let dragEl: HTMLDivElement | undefined = $state();
	let dropLineEl: HTMLDivElement | undefined = $state();

	let mouseDownAt: { x: number; y: number } | null = null;
	let sourcePos: number | null = null;
	let sourceDom: HTMLElement | null = null;
	let insertAfter = false;
	let justDragged = false;
	let lastClientX = 0;
	let lastClientY = 0;
	let scrollSpeed = 0;
	let scrollRAF: number | null = null;

	function position() {
		if (!wrapEl) return;
		if ($nodeMenuPos === null || dragging) return;

		const domNode = view.nodeDOM($nodeMenuPos);
		if (!(domNode instanceof HTMLElement)) return;

		let { left, top, height } = domNode.getBoundingClientRect();

		left -= 26;
		top += height / 2 - 10;

		wrapEl.style.top = `${top}px`;
		wrapEl.style.left = `${left}px`;
	}

	onMount(position);

	nodeMenuPos.subscribe(async () => {
		await tick();
		position();
	});

	function onDelete() {
		if ($nodeMenuPos === null) return;
		deleteNode(view, $nodeMenuPos);
		show = false;
	}

	function positionDrag(clientX: number, clientY: number) {
		if (!dragEl) return;
		dragEl.style.left = `${clientX + 16}px`;
		dragEl.style.top = `${clientY - 16}px`;
	}

	function updateDropIndicator() {
		if (!dropLineEl) return;

		if ($nodeMenuPos === null) {
			dropLineEl.style.display = 'none';
			return;
		}

		const targetDom = view.nodeDOM($nodeMenuPos);
		if (!(targetDom instanceof HTMLElement)) {
			dropLineEl.style.display = 'none';
			return;
		}

		const rect = targetDom.getBoundingClientRect();
		insertAfter = lastClientY >= rect.top + rect.height / 2;

		dropLineEl.style.display = 'block';
		dropLineEl.style.top = `${insertAfter ? rect.bottom : rect.top}px`;
		dropLineEl.style.left = `${rect.left}px`;
		dropLineEl.style.width = `${rect.width}px`;
	}

	function scrollStep() {
		if (!dragging || scrollSpeed === 0) {
			scrollRAF = null;
			return;
		}

		window.scrollBy(0, scrollSpeed);

		// the page scrolled under a stationary pointer - recompute what's
		// now under it so the handle/indicator/target stay in sync
		const result = view.posAtCoords({ left: lastClientX, top: lastClientY });
		if (result) {
			nodeMenuPos.set(topLevelBlockPosAt(view.state.doc.resolve(result.pos)));
		}
		positionDrag(lastClientX, lastClientY);
		updateDropIndicator();

		scrollRAF = requestAnimationFrame(scrollStep);
	}

	function updateAutoScroll(clientY: number) {
		const vh = window.innerHeight;
		if (clientY < AUTOSCROLL_MARGIN) {
			scrollSpeed = -Math.ceil((AUTOSCROLL_MARGIN - clientY) / 4);
		} else if (clientY > vh - AUTOSCROLL_MARGIN) {
			scrollSpeed = Math.ceil((AUTOSCROLL_MARGIN - (vh - clientY)) / 4);
		} else {
			scrollSpeed = 0;
		}

		if (scrollSpeed !== 0 && scrollRAF === null) {
			scrollRAF = requestAnimationFrame(scrollStep);
		}
	}

	function startDrag() {
		dragging = true;

		if (sourcePos !== null) {
			const dom = view.nodeDOM(sourcePos);
			if (dom instanceof HTMLElement) {
				sourceDom = dom;
				sourceDom.classList.add('pm-drag-source');

				if (dragEl) {
					dragEl.innerHTML = '';
					dragEl.appendChild(dom.cloneNode(true) as HTMLElement);
				}
			}
		}
	}

	function endDrag() {
		dragging = false;

		if (sourceDom) {
			sourceDom.classList.remove('pm-drag-source');
			sourceDom = null;
		}
		if (dragEl) dragEl.innerHTML = '';
		if (dropLineEl) dropLineEl.style.display = 'none';

		if (scrollRAF !== null) {
			cancelAnimationFrame(scrollRAF);
			scrollRAF = null;
		}
		scrollSpeed = 0;

		if (sourcePos !== null && $nodeMenuPos !== null) {
			moveNode(view, sourcePos, $nodeMenuPos, insertAfter);
		}

		sourcePos = null;
		justDragged = true;
		tick().then(() => (justDragged = false));
	}

	function onMouseDown(event: MouseEvent) {
		if (event.button !== 0) return;
		if ($nodeMenuPos === null) return;

		mouseDownAt = { x: event.clientX, y: event.clientY };
		sourcePos = $nodeMenuPos;
		event.preventDefault();
	}

	function onMouseMove(event: MouseEvent) {
		lastClientX = event.clientX;
		lastClientY = event.clientY;

		if (mouseDownAt && !dragging) {
			const dx = event.clientX - mouseDownAt.x;
			const dy = event.clientY - mouseDownAt.y;
			if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
				startDrag();
			}
		}

		if (dragging) {
			positionDrag(event.clientX, event.clientY);
			updateDropIndicator();
			updateAutoScroll(event.clientY);
		}
	}

	function onMouseUp() {
		if (dragging) {
			endDrag();
		}
		mouseDownAt = null;
		sourcePos = null;
	}

	function onTriggerClickCapture(event: MouseEvent) {
		if (justDragged) {
			event.preventDefault();
			event.stopPropagation();
		}
	}
</script>

<svelte:window onscrollcapture={position} onresize={position} />
<svelte:body onmousemove={onMouseMove} onmouseup={onMouseUp} />

<div class="drag-wrap" bind:this={dragEl}></div>
<div class="drop-line" bind:this={dropLineEl}></div>

<div class="wrap" bind:this={wrapEl} class:show={$nodeMenuPos !== null && !dragging}>
	<Dropdown bind:show width={250}>
		{#snippet content()}
			<ActionList>
				{#if commentsAvailable}
					<ActionListItem on:click={onComment}>
						{#snippet start()}
							<IconChatRight size={14} />
						{/snippet}
						Comment
					</ActionListItem>
				{/if}
				<ActionListItem>
					{#snippet start()}
						<IconCopy size={14} />
					{/snippet}
					Duplicate
				</ActionListItem>
				<ActionListItem type="danger" on:click={onDelete}>
					{#snippet start()}
						<IconTrash size={14} />
					{/snippet}
					Delete
				</ActionListItem>
			</ActionList>
		{/snippet}

		{#snippet trigger()}
			<Tooltip text="Click to open menu, drag to move">
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<span
					onmousedown={onMouseDown}
					onclickcapture={onTriggerClickCapture}
					style="color: var(--text-light); cursor: grab;"
				>
					<IconButton size={20} color="input" variant="invisible">
						<IconGripVertical size={14} />
					</IconButton>
				</span>
			</Tooltip>
		{/snippet}
	</Dropdown>
</div>

{#if commentsAvailable}
	<CommentComposer bind:show={commentComposerOpen} {view} />
{/if}

<style>
	.wrap {
		position: fixed;
		z-index: 100;
		display: none;
	}
	.wrap.show {
		display: block;
	}

	.drag-wrap {
		position: fixed;
		top: 0;
		left: 0;
		z-index: 100;
		display: block;
		pointer-events: none;
		opacity: 0.85;
		max-width: 320px;
		max-height: 220px;
		overflow: hidden;
		border-radius: 8px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
		background: var(--box-background, #fff);
		transform: scale(0.96) rotate(-1deg);
		transform-origin: top left;
	}

	.drag-wrap:empty {
		display: none;
	}

	.drop-line {
		position: fixed;
		z-index: 100;
		display: none;
		height: 3px;
		border-radius: 3px;
		background: #299af3;
		pointer-events: none;
		transform: translateY(-1.5px);
	}

	:global(.pm-drag-source) {
		opacity: 0.35;
		transition: opacity 0.15s;
	}
</style>
