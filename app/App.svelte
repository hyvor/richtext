<script lang="ts">
	import { EditorView } from 'prosemirror-view';
	import { Editor } from '../src/lib';

	let editorView: EditorView = $state({} as EditorView);
</script>

<div class="container">
	<Editor
		bind:editorView
		value={localStorage.getItem('doc')}
		onvaluechange={(val) => localStorage.setItem('doc', val)}
		config={{
			embedEnabled: true,
			tableEnabled: true,
			colorButtonBackground: '#585895',
			imageUploader: async () => {
				if (!confirm('Simulate an upload?')) {
					return null;
				}

				const width = Math.floor(Math.random() * 300) + 300;
				return {
					src: `https://picsum.photos/${width}/${width}`,
					caption: '<b>This is a caption</b> with <i>HTML</i> support'
				};
			}
		}}
	/>
</div>

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
