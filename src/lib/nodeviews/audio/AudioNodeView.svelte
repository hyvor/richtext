<script lang="ts">
	import type { EditorView } from 'prosemirror-view';
	import type { EditorConfig } from '$lib/config';

	interface Props {
		src: string;
		getPos: () => number | undefined;
		view: EditorView;
		fileUploader: EditorConfig['fileUploader'];
		fileMaxSizeInMB?: number;
	}

	// getPos/view/fileUploader/fileMaxSizeInMB are unused here now - changing
	// and removing an audio node are both handled by the node menu instead
	// (see NodeMenu.svelte's "Change audio" action and generic Delete)
	let { src }: Props = $props();

	let audioEl: HTMLAudioElement | undefined = $state();
</script>

<div class="audio-wrap">
	{#if src}
		<audio {src} bind:this={audioEl} controls></audio>
	{:else}
		<p>No audio selected.</p>
	{/if}
</div>

<style>
	.audio-wrap {
		display: flex;
		flex-direction: column;
		margin-top: 30px;
	}

	audio {
		width: 100%;
	}
</style>
