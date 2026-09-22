<script lang="ts">
	import { createBubbler, stopPropagation } from 'svelte/legacy';
	import {
		ActionList,
		ActionListItem,
		Button,
		Dropdown,
		IconMessage,
		Loader,
		TextInput
	} from '@hyvor/design/components';
	import IconCaretDown from '@hyvor/icons/IconCaretDown';
	import { tick } from 'svelte';
	import type { LinkSearchConfig, LinkSearchResult } from '../../../config';

	const bubble = createBubbler();

	interface Props {
		config: LinkSearchConfig;
		onSelect: (url: string) => void;
	}

	let { config, onSelect }: Props = $props();

	const scopes = $derived(config.scopes ?? []);

	let currentScope = $state(
		config.scopes?.find((s) => s.id === config.defaultScopeId) ?? config.scopes?.[0]
	);
	let scopeDropdownShow = $state(false);

	let input = $state('');
	let isLoading = $state(false);
	let hasError = $state(false);
	let results: LinkSearchResult[] = $state([]);

	let searchTimeout: null | ReturnType<typeof setTimeout> = null;
	let requestId = 0;

	function handleInput(e: Event) {
		const value = (e.target as HTMLInputElement).value;

		if (searchTimeout) clearTimeout(searchTimeout);

		if (value.trim().length === 0) {
			requestId++;
			isLoading = false;
			hasError = false;
			results = [];
			return;
		}

		isLoading = true;
		hasError = false;
		searchTimeout = setTimeout(search, 500);
	}

	async function search() {
		const id = ++requestId;

		isLoading = true;
		hasError = false;

		try {
			const found = await config.search(input, currentScope?.id);
			if (id !== requestId) return;
			results = found;
		} catch {
			if (id !== requestId) return;
			hasError = true;
			results = [];
		} finally {
			if (id === requestId) isLoading = false;
		}
	}

	async function handleScopeSelect(scope: { id: string | number; name: string }) {
		currentScope = scope;
		await tick();
		scopeDropdownShow = false;

		if (input.trim().length) search();
	}
</script>

<div class="input-wrap">
	<TextInput
		placeholder={config.placeholder ?? 'Search...'}
		block
		autofocus
		bind:value={input}
		on:input={handleInput}
	/>

	{#if scopes.length > 1}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div onclick={stopPropagation(bubble('click'))}>
			<Dropdown align="end" bind:show={scopeDropdownShow}>
				{#snippet trigger()}
					<Button color="gray">
						{currentScope?.name}
						{#snippet end()}
							<IconCaretDown size={12} />
						{/snippet}
					</Button>
				{/snippet}
				{#snippet content()}
					<ActionList selection="single">
						{#each scopes as scope}
							<ActionListItem
								selected={scope.id === currentScope?.id}
								on:select={() => handleScopeSelect(scope)}
							>
								{scope.name}
							</ActionListItem>
						{/each}
					</ActionList>
				{/snippet}
			</Dropdown>
		</div>
	{/if}
</div>

<div class="results">
	{#if isLoading}
		<Loader block padding={40} />
	{:else if hasError}
		<IconMessage
			error
			message={config.errorText ?? 'Could not load results'}
			padding={35}
			iconSize={60}
		/>
	{:else if input.trim().length}
		{#if results.length === 0}
			<IconMessage
				empty
				message={config.noResultsText ?? 'Nothing found'}
				padding={35}
				iconSize={60}
			/>
		{:else}
			{#each results as result}
				<div
					class="result"
					role="button"
					tabindex="0"
					onclick={() => onSelect(result.url)}
					onkeyup={bubble('keyup')}
				>
					<div class="title">{result.title}</div>
					<div class="description">{result.description ?? result.url}</div>
				</div>
			{/each}
		{/if}
	{/if}
</div>

<style lang="scss">
	.input-wrap {
		display: flex;
		gap: 10px;
	}

	.results {
		margin: 15px 0;
		max-height: 400px;
		overflow-y: auto;

		.result {
			padding: 15px 20px;
			cursor: pointer;
			border-radius: var(--box-radius);

			&:hover {
				background: var(--hover);
			}

			.title {
				font-weight: 600;
			}

			.description {
				font-size: 14px;
				color: var(--text-light);
				margin-top: 2px;
			}
		}
	}
</style>
