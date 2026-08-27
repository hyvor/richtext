<script lang="ts">
	import { IconMessage, Loader } from '@hyvor/design/components';
	import BookmarkDisplay from './BookmarkDisplay.svelte';
	import type { EditorConfig, BookmarkLink } from '$lib/config';

	interface Props {
		url: string;
		fetchBookmark: EditorConfig['bookmark'];
	}

	let { url, fetchBookmark }: Props = $props();

	let isLoading = $state(true);
	let link: BookmarkLink | null = $state(null);
	let error: string | null = $state(null);

	$effect(() => {
		const currentUrl = url;
		const fetcher = fetchBookmark;

		isLoading = true;
		error = null;
		link = null;

		if (!fetcher) {
			error = 'Bookmarks are not configured';
			isLoading = false;
			return;
		}

		fetcher(currentUrl)
			.then((result) => {
				if (result) {
					link = result;
				} else {
					error = 'Failed to load bookmark';
				}
			})
			.catch(() => {
				error = 'Failed to load bookmark';
			})
			.finally(() => {
				isLoading = false;
			});
	});
</script>

<div>
	{#if isLoading}
		<Loader block padding={100} />
	{:else if error}
		<IconMessage error padding={60} message={error} iconSize={70} />
	{:else if link}
		<BookmarkDisplay {link} />
	{/if}
</div>
