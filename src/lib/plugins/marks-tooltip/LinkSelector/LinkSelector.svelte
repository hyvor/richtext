<script lang="ts">
	import { Modal, TabNav, TabNavItem } from '@hyvor/design/components';
	import IconHash from '@hyvor/icons/IconHash';
	import IconLink45deg from '@hyvor/icons/IconLink45deg';
	import IconSearch from '@hyvor/icons/IconSearch';
	import Paste from './Paste.svelte';
	import type { EditorView } from 'prosemirror-view';
	import { toggleMark } from 'prosemirror-commands';
	import { TextSelection } from 'prosemirror-state';
	import Anchors from './Anchors.svelte';
	import { editorStore } from '../../../store';
	import LinkSearch from './LinkSearch.svelte';

	interface Props {
		show: boolean;
		view: EditorView;
		edit?: string;
	}

	let { show = $bindable(), view, edit }: Props = $props();

	let inputValue = $state(edit ?? '');
	let isEditing = !!edit;

	let searchTabs = $derived($editorStore?.props.editorConfig?.linkSearch ?? []);

	let activeTab: 'paste' | 'anchors' | number = $state('paste');

	function handleAdd(e: CustomEvent<string>) {
		handleSelect(e.detail);
	}

	function handleSelect(href: string) {
		if (isEditing) {
			// remove the link
			toggleMark(view.state.schema.marks.link!)(view.state, view.dispatch);
		}

		toggleMark(view.state.schema.marks.link!, { href })(view.state, view.dispatch);
		show = false;
		view.focus();

		if (!isEditing) focusAtLinkEnd();
	}

	function focusAtLinkEnd() {
		const tr = view.state.tr;
		const selection = TextSelection.create(tr.doc, view.state.selection.to);
		view.dispatch(tr.setSelection(selection).scrollIntoView());
		view.focus();
	}
</script>

<Modal bind:show>
	{#snippet title()}
		<TabNav>
			<TabNavItem name="paste" active={activeTab === 'paste'} onclick={() => (activeTab = 'paste')}>
				{#snippet start()}
					<IconLink45deg />
				{/snippet}
				Paste Link
			</TabNavItem>
			<TabNavItem
				name="anchors"
				active={activeTab === 'anchors'}
				onclick={() => (activeTab = 'anchors')}
			>
				{#snippet start()}
					<IconHash />
				{/snippet}
				Anchors
			</TabNavItem>
			{#each searchTabs as tab, i (i)}
				<TabNavItem name={'tab-' + i} active={activeTab === i} onclick={() => (activeTab = i)}>
					{#snippet start()}
						<IconSearch size={13} />
					{/snippet}
					{tab.label}
				</TabNavItem>
			{/each}
		</TabNav>
	{/snippet}

	{#if activeTab === 'paste'}
		<Paste on:add={handleAdd} bind:input={inputValue} />
	{:else if activeTab === 'anchors'}
		<Anchors on:add={handleAdd} />
	{:else if typeof activeTab === 'number' && searchTabs[activeTab]}
		<LinkSearch config={searchTabs[activeTab]} onSelect={handleSelect} />
	{/if}
</Modal>
