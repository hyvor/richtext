<script lang="ts">
	import { EditorView } from 'prosemirror-view';
	import { Editor } from '../src/lib';
	import { Base } from '@hyvor/design/components';

	let editorView: EditorView = $state({} as EditorView);
</script>

<Base>
	<div class="container">
		<Editor
			bind:editorView
			value={localStorage.getItem('doc')}
			onvaluechange={(val) => localStorage.setItem('doc', val)}
			config={{
				embedEnabled: true,
				tableEnabled: true,
				colorButtonBackground: '#585895',
				fileUploader: async (blob, name, type) => {
					return {
						url: URL.createObjectURL(blob)
					};
				}
			}}
		/>
	</div>
</Base>

<div class="focus">
	<button onclick={() => editorView.focus()}>Focus</button>
</div>

<style>
	.container {
		margin: 60px auto;
		min-height: 600px;
		width: 650px;
		background-color: #fff;
		border: 1px solid #ccc;
		border-radius: 20px;
	}
	.focus {
		margin: 20px auto;
		width: 650px;
		text-align: center;
	}
</style>
