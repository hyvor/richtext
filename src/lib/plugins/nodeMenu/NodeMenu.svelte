<script lang="ts">
	import { onMount, tick } from 'svelte';
	import {
		ActionList,
		ActionListItem,
		Dropdown,
		IconButton,
		Tooltip
	} from '@hyvor/design/components';
	import IconTrash from '@hyvor/icons/IconTrash';
	import type { EditorView } from 'prosemirror-view';
	import { NodeSelection } from 'prosemirror-state';
	import IconGripVertical from '@hyvor/icons/IconGripVertical';
	import IconChatRight from '@hyvor/icons/IconChatRight';
	import { deleteNode, moveNode, nodeMenuPos, topLevelBlockPosAt } from './node-menu';
	import { suggestionsPluginKey } from '../suggestions/plugin-suggestions';
	import { isCommentingDisabled } from '../suggestions/commands';
	import CommentInput from '../suggestions/CommentInput.svelte';

	interface Props {
		view: EditorView;
	}

	let { view }: Props = $props();

	let show = $state(false);
	let commentInputOpen = $state(false);

	// static for the editor's lifetime - the suggestions plugin is either
	// installed at creation or not (see src/lib/plugins/suggestions)
	const commentsAvailable = !!suggestionsPluginKey.getState(view.state);

	function selectNode(pos: number) {
		if (!view.state.doc.nodeAt(pos)) return false;
		view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
		return true;
	}

	function onComment() {
		if ($nodeMenuPos === null) return;
		if (!selectNode($nodeMenuPos)) return;
		// deferred - swapping the DOM synchronously here detaches the clicked item before Dropdown's own outside-click listener sees this same click, so it misreads it as "outside" and closes the menu
		setTimeout(() => {
			commentInputOpen = true;
		});
	}

	// reset back to the action list once the dropdown closes, so it doesn't
	// reopen showing a stale comment box
	$effect(() => {
		if (!show) commentInputOpen = false;
	});

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

		let { left, top } = domNode.getBoundingClientRect();

		// align near the top-left corner of the node, rather than vertically
		// centered on it
		left -= 26;
		top += 5;

		wrapEl.style.top = `${top}px`;
		wrapEl.style.left = `${left}px`;
	}

	// how long the pointer can sit idle before the menu hides itself
	const IDLE_HIDE_MS = 1000;
	let idleTimer: ReturnType<typeof setTimeout> | null = null;

	function clearIdleTimer() {
		if (idleTimer !== null) {
			clearTimeout(idleTimer);
			idleTimer = null;
		}
	}

	// keeps the menu visible while the pointer is actively moving (over a
	// node, or over the menu/dropdown itself) and hides it once the pointer
	// has been still for IDLE_HIDE_MS - never while dragging or while the
	// dropdown is open, since that would yank the menu away mid-interaction
	function scheduleIdleHide() {
		clearIdleTimer();
		if ($nodeMenuPos === null || dragging || show) return;
		idleTimer = setTimeout(() => {
			idleTimer = null;
			if (!dragging && !show) nodeMenuPos.set(null);
		}, IDLE_HIDE_MS);
	}

	// hides the menu immediately once the user starts typing, so it doesn't
	// linger over a node the pointer isn't near anymore
	function onEditorKeydown(event: KeyboardEvent) {
		if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(event.key)) return;
		clearIdleTimer();
		nodeMenuPos.set(null);
	}

	onMount(() => {
		position();
		view.dom.addEventListener('keydown', onEditorKeydown);
		return () => {
			view.dom.removeEventListener('keydown', onEditorKeydown);
			clearIdleTimer();
		};
	});

	nodeMenuPos.subscribe(async () => {
		await tick();
		position();
	});

	function onDelete() {
		if ($nodeMenuPos === null) return;
		const pos = $nodeMenuPos;
		// deferred - see onComment() above for why closing the dropdown can't happen synchronously inside this click handler
		setTimeout(() => {
			deleteNode(view, pos);
			show = false;
		});
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

		scheduleIdleHide();

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
			return;
		}
		if ($nodeMenuPos !== null) {
			selectNode($nodeMenuPos);
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
			{#if commentInputOpen}
				<CommentInput
					{view}
					onSubmit={() => {
						commentInputOpen = false;
						show = false;
					}}
					onCancel={() => (commentInputOpen = false)}
				/>
			{:else}
				<ActionList>
					{#if commentsAvailable && !isCommentingDisabled(view.state)}
						<ActionListItem on:click={onComment}>
							{#snippet start()}
								<IconChatRight size={14} />
							{/snippet}
							Comment
						</ActionListItem>
					{/if}
					<ActionListItem type="danger" on:click={onDelete}>
						{#snippet start()}
							<IconTrash size={14} />
						{/snippet}
						Delete
					</ActionListItem>
				</ActionList>
			{/if}
		{/snippet}

		{#snippet trigger()}
			<Tooltip text="Click to open menu, drag to move" maxWidth={175}>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<span
					onmousedown={onMouseDown}
					onclickcapture={onTriggerClickCapture}
					style="color: var(--text-light); cursor: grab;"
				>
					<IconButton size={22} color="input" variant="invisible">
						<IconGripVertical size={16} />
					</IconButton>
				</span>
			</Tooltip>
		{/snippet}
	</Dropdown>
</div>

<style>
	.wrap {
		position: fixed;
		z-index: 900;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.15s ease;
	}
	.wrap.show {
		opacity: 1;
		pointer-events: auto;
	}

	.drag-wrap {
		position: fixed;
		top: 0;
		left: 0;
		z-index: 900;
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
		z-index: 900;
		display: none;
		height: 3px;
		border-radius: 3px;
		background: #8cf;
		pointer-events: none;
		transform: translateY(-1.5px);
	}

	:global(.pm-drag-source) {
		opacity: 0.35;
		transition: opacity 0.15s;
	}
</style>
