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
				imageUploader: async () => {
					if (!confirm('Simulate an upload?')) {
						return null;
					}

					const width = Math.floor(Math.random() * 300) + 300;
					return {
						src: `https://picsum.photos/${width}/${width}`,
						caption: '<b>This is a caption</b> with <i>HTML</i> support'
					};
				},
				audioUploader: async () => {
					if (!confirm('Simulate an upload?')) {
						return null;
					}

					const audios = [
						'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
						'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
						'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3'
					];
					const src = audios[Math.floor(Math.random() * audios.length)];

					return {
						src
					};
				},
				bookmarkGetter: async () => {
					if (!confirm('Simulate an bookmark?')) {
						return null;
					}

					return {
						url: 'https://www.google.com',
						title: 'Google',
						description: 'Google is a search engine',
						image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR28Yb6U3AlNA5vIusLWEahuo87-kpKkkZefA&s'
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
