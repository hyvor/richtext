<script lang="ts">
	import { EmojiPicker } from '@hyvor/design/components';

	interface Props {
		emoji: string | undefined;
		changeAttr: (name: string, value: string) => void;
	}

	let { emoji, changeAttr }: Props = $props();

	function handleSelect(e: string) {
		changeAttr('emoji', e);
	}
</script>

<EmojiPicker
	{emoji}
	onselect={handleSelect}
	removable
	iconButtonSize="small"
	iconButtonColor="input"
	iconButtonVariant="invisible"
/>
