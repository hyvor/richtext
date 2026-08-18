<script lang="ts">
	import { onMount } from 'svelte';
	import { IconButton, TextInput } from '@hyvor/design/components';
	import IconSend from '@hyvor/icons/IconSend';
	import IconX from '@hyvor/icons/IconX';
	import type { EditorView } from 'prosemirror-view';
	import { addComment } from './commands';

	interface Props {
		view: EditorView;
		onSubmit?: () => void;
		onCancel?: () => void;
	}

	let { view, onSubmit, onCancel }: Props = $props();

	let text = $state('');
	let inputEl: HTMLInputElement | undefined = $state();

	onMount(() => {
		inputEl?.focus();
	});

	function submit() {
		const trimmed = text.trim();
		if (!trimmed) return;
		addComment(view, trimmed);
		text = '';
		view.focus();
		onSubmit?.();
	}

	function cancel() {
		text = '';
		view.focus();
		onCancel?.();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			submit();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancel();
		}
	}
</script>

<div class="comment-row">
	<TextInput
		size="small"
		placeholder="Write a comment..."
		bind:value={text}
		bind:input={inputEl}
		onkeydown={onKeydown}
	/>
	<IconButton size="small" variant="invisible" color="gray" on:click={cancel}>
		<IconX size={12} />
	</IconButton>
	<IconButton
		size="small"
		variant="fill"
		color="accent"
		disabled={text.trim().length === 0}
		on:click={submit}
	>
		<IconSend size={12} />
	</IconButton>
</div>

<style>
	.comment-row {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 8px;
		width: 240px;
		overflow: hidden;
	}

	.comment-row :global(.input-wrap) {
		flex: 1;
		min-width: 0;
	}
</style>
