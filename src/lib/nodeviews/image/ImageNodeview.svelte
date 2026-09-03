<script lang="ts">
	import type { EditorView } from 'prosemirror-view';
	import type { EditorConfig } from '$lib/config';
	import { setNodeAttrs } from '../../plugins/suggestions/commands';
	import IconExclamationTriangleFill from '@hyvor/icons/IconExclamationTriangleFill';
	import IconInfoCircleFill from '@hyvor/icons/IconInfoCircleFill';

	interface Props {
		src: string | null;
		alt: string | null;
		width: number | null;
		height: number | null;
		getPos: () => number | undefined;
		uploadFileConfig: EditorConfig['uploadFileConfig'];
		oversizedNoteText: EditorConfig['image']['oversizedNoteText'];
		view: EditorView;
		editable: boolean;
	}

	let { src, alt, width, height, getPos, view, oversizedNoteText, editable }: Props = $props();

	let imgEl: HTMLImageElement | undefined = $state();
	let imgLoaded = $state(false);
	let renderedWidth = $state(0);

	$effect(() => {
		if (!imgEl) return;
		const el = imgEl;
		const observer = new ResizeObserver(() => {
			renderedWidth = el.clientWidth;
		});
		observer.observe(el);
		return () => observer.disconnect();
	});

	let intendedWidth = $derived.by(() => {
		imgLoaded;
		return width ?? imgEl?.naturalWidth ?? 0;
	});
	let isOversized = $derived(renderedWidth > 0 && intendedWidth > renderedWidth + 1);

	let hovering = $state(false);
	let editingAlt = $state(false);
	let altDraft = $state('');
	let altInputEl: HTMLInputElement | undefined = $state();

	let resizeSide: 'left' | 'right' | null = $state(null);
	let ghostWidth = $state(0);

	function onMouseEnter() {
		hovering = true;
	}

	function onMouseLeave() {
		hovering = false;
	}

	let aspectRatio = $derived.by(() => {
		imgLoaded;
		return imgEl?.naturalWidth && imgEl?.naturalHeight ? imgEl.naturalWidth / imgEl.naturalHeight : 1;
	});
	let ghostHeight = $derived(Math.round(ghostWidth / aspectRatio));
	let ghostPercent = $derived(
		imgEl?.naturalWidth ? Math.round((ghostWidth / imgEl.naturalWidth) * 100) : 100
	);

	function updateProps(
		props: Partial<{
			src?: string | null;
			alt?: string | null;
			width?: number | null;
			height?: number | null;
		}>
	) {
		const pos = getPos();
		if (pos === undefined) return;

		setNodeAttrs(view, pos, {
			...{
				src,
				alt,
				width,
				height
			},
			...props
		});
	}

	function startEditAlt() {
		altDraft = alt ?? '';
		editingAlt = true;
	}

	function submitAlt() {
		editingAlt = false;
		if (altDraft === (alt ?? '')) return;
		updateProps({ alt: altDraft });
	}

	function onAltKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			altInputEl?.blur();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			editingAlt = false;
		}
	}

	$effect(() => {
		if (editingAlt) altInputEl?.focus();
	});

	function startResize(side: 'left' | 'right', event: MouseEvent) {
		if (!imgEl) return;
		event.preventDefault();
		event.stopPropagation();

		const naturalWidth = imgEl.naturalWidth || 1;
		const startWidth = width ?? imgEl.getBoundingClientRect().width;
		const startX = event.clientX;
		const minWidth = 60;
		const maxWidth = naturalWidth * 3;

		resizeSide = side;
		ghostWidth = startWidth;

		function onMove(e: MouseEvent) {
			const dx = e.clientX - startX;
			const delta = side === 'right' ? dx * 2 : -dx * 2;
			ghostWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));
		}

		function onUp() {
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
			resizeSide = null;

			const isNatural = Math.abs(ghostWidth - naturalWidth) < 1;
			updateProps({
				width: isNatural ? null : Math.round(ghostWidth),
				height: isNatural ? null : Math.round(ghostWidth / aspectRatio)
			});
		}

		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	}
</script>

<div
	class="image-node-wrap"
	onmouseenter={onMouseEnter}
	onmouseleave={onMouseLeave}
	role="group"
>
	<img
		{src}
		{alt}
		bind:this={imgEl}
		width={width ? width : undefined}
		height={height ? height : undefined}
		onload={() => (imgLoaded = true)}
	/>

	{#if editable}
		<div class="hover-tint" class:visible={hovering || resizeSide !== null}></div>

		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="resize-handle left"
			class:visible={hovering || resizeSide === 'left'}
			onmousedown={(e) => startResize('left', e)}
		></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="resize-handle right"
			class:visible={hovering || resizeSide === 'right'}
			onmousedown={(e) => startResize('right', e)}
		></div>
	{/if}

	{#if isOversized}
		<div class="oversized-note" class:visible={hovering}>
			<IconInfoCircleFill size={11} />
			{oversizedNoteText}
		</div>
	{/if}

	{#if !editable}
		<!-- read-only: no alt-text editing affordance -->
	{:else if editingAlt}
		<input
			class="alt-badge alt-input"
			bind:this={altInputEl}
			bind:value={altDraft}
			placeholder="Describe this image..."
			onkeydown={onAltKeydown}
			onblur={submitAlt}
			onclick={(e) => e.stopPropagation()}
			onmousedown={(e) => e.stopPropagation()}
		/>
	{:else}
		<button
			type="button"
			class="alt-badge"
			class:empty={!alt}
			onclick={(e) => {
				e.stopPropagation();
				startEditAlt();
			}}
			onmousedown={(e) => e.stopPropagation()}
		>
			{#if !alt}
				<IconExclamationTriangleFill size={11} />
			{/if}
			{alt || 'Add alt text'}
		</button>
	{/if}

	{#if resizeSide !== null}
		<div class="resize-ghost" style="width: {ghostWidth}px; height: {ghostHeight}px;">
			{#if src}
				<img {src} alt="" />
			{/if}
		</div>
		<div class="resize-label">{ghostPercent}% &middot; {Math.round(ghostWidth)}&times;{ghostHeight}px</div>
	{/if}
</div>

<style>
	.image-node-wrap {
		position: relative;
		display: inline-flex;
		max-width: 100%;
	}

	img {
		display: block;
		max-width: 100%;
		height: auto;
		border-radius: 6px;
	}

	.hover-tint {
		position: absolute;
		inset: 0;
		border-radius: 6px;
		box-shadow: inset 0 -60px 40px -30px rgba(0, 0, 0, 0.25);
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.15s ease;
	}

	.hover-tint.visible {
		opacity: 1;
	}

	.resize-handle {
		position: absolute;
		top: 50%;
		width: 8px;
		height: 40px;
		margin-top: -20px;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.9);
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
		opacity: 0;
		cursor: ew-resize;
		transition: opacity 0.15s ease;
	}

	.resize-handle.visible {
		opacity: 1;
	}

	.resize-handle.left {
		left: 8px;
	}

	.resize-handle.right {
		right: 8px;
	}

	.alt-badge {
		position: absolute;
		right: 8px;
		bottom: 8px;
		display: flex;
		align-items: center;
		gap: 5px;
		max-width: calc(100% - 16px);
		padding: 4px 10px;
		border: none;
		border-radius: 6px;
		background: rgba(0, 0, 0, 0.65);
		color: #fff;
		font-size: 12px;
		line-height: 1.4;
		text-align: left;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
		cursor: text;
		font-family: inherit;
	}

	.alt-badge.empty {
		font-style: italic;
		color: rgba(255, 255, 255, 0.85);
	}

	.alt-badge.empty :global(svg) {
		flex-shrink: 0;
		color: #ffc255;
	}

	.oversized-note {
		position: absolute;
		top: 8px;
		right: 8px;
		display: flex;
		align-items: center;
		gap: 5px;
		max-width: calc(100% - 16px);
		padding: 4px 10px;
		border-radius: 6px;
		background: rgba(0, 0, 0, 0.65);
		color: #fff;
		font-size: 12px;
		line-height: 1.4;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.15s ease;
	}

	.oversized-note.visible {
		opacity: 1;
	}

	.oversized-note :global(svg) {
		flex-shrink: 0;
		color: #7ab8ff;
	}

	.alt-input {
		width: 220px;
		outline: none;
	}

	.alt-input::placeholder {
		color: rgba(255, 255, 255, 0.75);
	}

	.resize-ghost {
		position: absolute;
		top: 0;
		left: 50%;
		transform: translateX(-50%);
		overflow: hidden;
		border-radius: 6px;
		outline: 2px dashed rgba(0, 0, 0, 0.4);
		outline-offset: 2px;
		opacity: 0.45;
		pointer-events: none;
		z-index: 10;
	}

	.resize-ghost img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.resize-label {
		position: absolute;
		top: 8px;
		left: 50%;
		transform: translateX(-50%);
		padding: 3px 10px;
		border-radius: 20px;
		background: rgba(0, 0, 0, 0.75);
		color: #fff;
		font-size: 11px;
		white-space: nowrap;
		pointer-events: none;
		z-index: 11;
	}	
</style>
