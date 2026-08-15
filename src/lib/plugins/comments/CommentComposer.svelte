<script lang="ts">
	import { Modal, Textarea, Button } from '@hyvor/design/components';
	import { tick } from 'svelte';
	import type { EditorView } from 'prosemirror-view';
	import { addComment } from './commands';

	interface Props {
		show: boolean;
		view: EditorView;
	}

	let { show = $bindable(), view }: Props = $props();

	let text = $state('');
	// Textarea's own `textarea` bindable has a non-undefined fallback
	// ({} as HTMLTextAreaElement) - binding to a plain `undefined`-initialized
	// local throws, so match its fallback here too.
	let textareaEl: HTMLTextAreaElement = $state({} as HTMLTextAreaElement);

	$effect(() => {
		if (show) {
			tick().then(() => {
				if (textareaEl instanceof HTMLTextAreaElement) textareaEl.focus();
			});
		}
	});

	function submit() {
		const trimmed = text.trim();
		if (!trimmed) return;
		addComment(view, trimmed);
		text = '';
		show = false;
		view.focus();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			submit();
		}
	}
</script>

<Modal bind:show>
	{#snippet title()}
		Add comment
	{/snippet}

	<Textarea placeholder="Write a comment..." rows={4} block bind:value={text} bind:textarea={textareaEl} onkeydown={onKeydown} />

	<div class="buttons">
		<Button variant="fill" disabled={text.trim().length === 0} onclick={submit}>Comment</Button>
	</div>
</Modal>

<style>
	.buttons {
		margin-top: 15px;
		text-align: right;
	}
</style>
