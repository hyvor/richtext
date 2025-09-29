<script lang="ts">
	import { IconButton, Loader, Tooltip, confirm } from '@hyvor/design/components';
	import type { EditorView } from 'prosemirror-view';
	import IconPencil from '@hyvor/icons/IconPencil';
	import IconTrash from '@hyvor/icons/IconTrash';
	import type { Config } from '$lib/config';
	import { uploadAudio } from './audio-upload';

	interface Props {
		src: string;
		getPos: () => number | undefined;
		view: EditorView;
		fileUploader: Config['fileUploader'];
		fileMaxSizeInMB?: number;
	}

	let { src, getPos, view, fileUploader, fileMaxSizeInMB }: Props = $props();

	let audioEl: HTMLAudioElement | undefined = $state();

	let loading = false;

	function updateProps(
		props: Partial<{
			src?: string | Blob;
		}>
	) {
		const pos = getPos();
		if (pos === undefined) return;

		view.dispatch(
			view.state.tr.setNodeMarkup(pos, undefined, {
				...{
					src
				},
				...props
			})
		);
	}

	async function handleChangeClick() {
		const audio = await uploadAudio(fileUploader, fileMaxSizeInMB);

		if (audio === null) {
			return;
		}

		updateProps({
			src: audio.url
		});

		return;
	}

	async function handleDelete() {
		if (
			await confirm({
				title: 'Remove audio',
				content: 'Are you sure you want to remove this audio?',
				confirmText: 'Yes, remove it',
				danger: true
			})
		) {
			deleteNodeAudio();
		}
	}

	function deleteNodeAudio() {
		const { tr } = view.state;
		const pos = getPos();
		if (pos === undefined) return;
		tr.delete(pos, pos + 1);
		view.dispatch(tr);
		view.focus();
	}
</script>

<div class="audio-wrap">
	{#if src}
		<div class="audio-actions">
			<Tooltip text="Change audio">
				<IconButton size="small" color="input" on:click={handleChangeClick}>
					<IconPencil size={12} />
				</IconButton>
			</Tooltip>

			<Tooltip text="Remove audio">
				<IconButton size="small" color="input" on:click={handleDelete}>
					<IconTrash size={12} />
				</IconButton>
			</Tooltip>
		</div>
		<div>
			{#if loading}
				<p>
					<Loader />
				</p>
			{:else if src}
				<audio {src} bind:this={audioEl} controls></audio>
			{:else}
				<p>No audio selected.</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.audio-wrap {
		display: flex;
		flex-direction: column;
	}

	.audio-actions {
		position: relative;
		align-self: flex-end;
		margin-bottom: 5px;
	}

	audio {
		width: 100%;
	}
</style>
