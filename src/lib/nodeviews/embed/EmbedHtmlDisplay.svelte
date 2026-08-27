<script lang="ts">
	import { onMount } from 'svelte';
	import { addParentResizeEvent } from './iframeParentResize';

	interface Props {
		src: string;
	}

	let { src }: Props = $props();

	onMount(() => {
		addParentResizeEvent();
	});
</script>

<iframe
	{src}
	title="Embed"
	sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
	allow="fullscreen;accelerometer;clipboard-write;encrypted-media;gyroscope;picture-in-picture;web-share;"
></iframe>

<style>
	iframe {
		width: 100%;
		border: none;
	}
</style>
