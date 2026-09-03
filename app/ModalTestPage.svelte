<script lang="ts">
	// Repro page for https://github.com/hyvor/richtext/issues/43 - "scrolling
	// from suggestion panel is buggy (ex when in a modal)":
	//   - resolving/deleting a suggestion should focus the next one
	//   - scrolling is wrong when the editor is opened in a modal, especially
	//     for suggestions near the end
	//
	// The editor sits inside a @hyvor/design Modal given a fixed height, so
	// its content area is its own scrollable region shorter than the window
	// (the same "editor not 100% of the available height" shape as
	// ScrollTestPage.svelte, just with a modal's overlay/portal DOM in the
	// ancestor chain instead of page chrome). Reachable at /modal-test.
	import { Editor, getSchema, type Author, type AuthorInfo } from '../src/lib';
	import { createDemoSuggestionSource } from './demoSuggestionSource';
	import { buildMorningRoutineDoc } from './demoMorningRoutineDoc';
	import { Base, Modal, Button } from '@hyvor/design/components';

	const AUTHOR: Author = 'ai';
	const MODAL_ID = 'modal-test-editor';

	function resolveAuthor(author: Author): AuthorInfo {
		if (author === 'ai') return { name: 'AI' };
		return { name: author };
	}

	const schema = getSchema({ suggestions: true });
	const source = createDemoSuggestionSource('modal-test-suggestions-source');
	const { doc, suggestionIds } = buildMorningRoutineDoc('modal-test-sg');

	const now = Date.now();
	for (const id of suggestionIds) {
		source.create(id, 'insert', AUTHOR, now);
	}

	let show = $state(true);
</script>

<Base>
	<div class="page">
		<h2>Modal scroll repro</h2>
		<p class="note">
			Repro for <a href="https://github.com/hyvor/richtext/issues/43" target="_blank">issue #43</a
			>: the editor below is inside a Modal (<code>@hyvor/design</code>) given a fixed height, so
			its content area scrolls on its own - shorter than the window, with 11 suggestions spread
			through content taller than that area. Test two things:
		</p>
		<ol class="note">
			<li>
				Click a suggestion's accept/reject checkmark - the panel and the editor should both jump
				to the <em>next</em> suggestion, not stay put or jump somewhere random. Work through several
				in a row, including the last couple.
			</li>
			<li>
				Click directly on a suggestion low in the panel list (especially the last one) - the
				editor should scroll to actually reveal it, not overshoot/undershoot or leave it hidden
				above/below the modal's visible area.
			</li>
		</ol>

		<Button onclick={() => (show = true)}>Reopen modal</Button>
	</div>

	<Modal bind:show id={MODAL_ID} bare width="700px" height="80vh">
		<p class="note">
			This scrollable area is shorter than the window - there's no page chrome around it here,
			just the modal's own fixed height. Click outside the modal or press Escape to close it.
		</p>

		<Editor
			value={JSON.stringify(doc)}
			{schema}
			editorConfig={{
				fileUploader: async (blob) => ({ url: URL.createObjectURL(blob) }),
				suggestions: {
					author: AUTHOR,
					mode: 'editing',
					resolveAuthor,
					source
				}
			}}
		/>

		<p class="note">Bottom of the modal's scrollable content.</p>
	</Modal>
</Base>

<style>
	.page {
		max-width: 700px;
		margin: 40px auto;
		padding: 0 20px;
	}

	.note {
		font-size: 13px;
		color: #555;
	}

	ol.note {
		padding-left: 20px;
	}
	ol.note li {
		margin-bottom: 8px;
	}

	/* Modal.svelte gives `.content` (id="${id}-desc") `flex:1` in bare mode
	   (so it fills the fixed-height `.inner`) but no `min-height:0` - without
	   it, a flex item defaults to shrink-to-fit its content, so a tall child
	   just grows `.content`, and the modal itself, instead of scrolling. This
	   is exactly the kind of setup that produces issue #43's "scroll wrongly
	   calculated in a modal": the editor is very tall now, and everything
	   downstream (activeId->itemEls scrollIntoView, jumpTo's
	   scrollPosIntoView) is scrolling the wrong container's wrong range. */
	:global(#modal-test-editor-desc) {
		min-height: 0;
		height: 100%;
		overflow-y: auto;
		box-sizing: border-box;
		padding: 20px 25px;
	}
</style>
