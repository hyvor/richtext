<script lang="ts">
	import type { Node } from 'prosemirror-model';
	import type { EditorView } from 'prosemirror-view';
	import { tick } from 'svelte';

	interface Props {
		view: EditorView;
		show: boolean;
		updateId: number;
	}

	let { view, show, updateId }: Props = $props();
	let tooltip: HTMLSpanElement | undefined = $state();
	let input: HTMLInputElement | undefined = $state();

	$effect(() => {
		if (updateId && show) {
			(async () => {
				await tick();
				updatePosition();
			})();
		}
	});

	function updatePosition() {
		if (!tooltip) return;

		const { from } = view.state.selection;
		const top = view.coordsAtPos(from).top;

		let box = tooltip.offsetParent!.getBoundingClientRect();

		tooltip.style.display = '';
		tooltip.style.bottom = box.bottom - top + 10 + 'px';
		tooltip.style.left = box.width / 2 - tooltip.getBoundingClientRect().width / 2 + 'px';
	}

	function getCurrentButton(): Node | null {
		const sel = view.state.selection;
		const button = view.state.doc.nodeAt(sel.from - sel.$from.parentOffset - 1);
		if (button?.type.name === 'button') {
			return button;
		}
		return null;
	}

	function getCurrentHref() {
		return getCurrentButton()?.attrs.href || '';
	}

	function handleInput() {
		const button = getCurrentButton();
		if (button && input) {
			const href = input.value;
			const tr = view.state.tr.setNodeMarkup(
				view.state.selection.from - view.state.selection.$from.parentOffset - 1,
				undefined,
				{
					...button.attrs,
					href
				}
			);
			view.dispatch(tr);
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === 'Escape') {
			event.preventDefault();
			view.focus();
		}
	}
</script>

{#if show}
	<span class="tooltip" bind:this={tooltip}>
		<input
			type="text"
			placeholder="Enter URL"
			value={getCurrentHref()}
			name="button-url"
			oninput={handleInput}
			onkeydown={handleKeydown}
			bind:this={input}
		/>
	</span>
{/if}

<style>
	.tooltip {
		position: absolute;
		background: var(--box-background);
		box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
		border-radius: 20px;
		margin-bottom: 10px;
		z-index: 100;
	}

	.tooltip:after {
		content: '';
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		width: 0;
		height: 0;
		border: 5px solid var(--box-background);
		border-bottom-color: transparent;
		position: absolute;
		border-left-color: transparent;
		border-right-color: transparent;
	}

	input {
		width: 100%;
		padding: 8px 20px;
		border: none;
		background-color: transparent;
		font-family: inherit;
	}
</style>
