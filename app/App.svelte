<script lang="ts">
	import { Editor } from '../src/lib';
	import { Base } from '@hyvor/design/components';

	let editor: Editor;

	let editable = $state(true);
	
	function setContent() {
		editor.setContent(JSON.stringify({
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [
						{
							type: 'text',
							text: 'This is a new content set programmatically.'
						}
					]
				}
			]
		}));
	}
</script>

<Base>
	<div class="container">
		<Editor
			bind:this={editor}
			value={localStorage.getItem('doc')}
			onvaluechange={(val) => localStorage.setItem('doc', val)}
			config={{
				codeBlockConfig: {
					language: true,
					annotations: true,
					annotationsUrl: null,
					fileName: true,
				},
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
	<button onclick={() => editor.focus()}>Focus</button>
	<button onclick={setContent}>Set content</button>
	<button onclick={() => {
		editable = !editable;
		editor.setEditable(editable);
	}}>
		{editable ? 'Set Readonly' : 'Set Editable'}
	</button>
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
