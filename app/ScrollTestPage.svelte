<script lang="ts">
	// Repro page for https://github.com/hyvor/richtext/issues/69 - "suggestion
	// panel docking when the editor is not 100% page height".
	//
	// The bug only shows up when the editor sits inside a scrollable area
	// that's shorter than the window (an app-shell layout: fixed header on
	// top, scrollable main content below - see .page/.page-main below) *and*
	// there's enough content+suggestions that the panel itself would be
	// taller than that visible area. Reachable at /scroll-test.
	import { Editor, getSchema, type Author, type AuthorInfo } from '../src/lib';
	import { createDemoSuggestionSource } from './demoSuggestionSource';
	import { buildMorningRoutineDoc } from './demoMorningRoutineDoc';
	import { Base } from '@hyvor/design/components';

	const AUTHOR: Author = 'ai';

	function resolveAuthor(author: Author): AuthorInfo {
		if (author === 'ai') return { name: 'AI' };
		return { name: author };
	}

	const schema = getSchema({ suggestions: true });
	const source = createDemoSuggestionSource('scroll-test-suggestions-source');
	const { doc, suggestionIds } = buildMorningRoutineDoc('scroll-test-sg');

	const now = Date.now();
	for (const id of suggestionIds) {
		source.create(id, 'insert', AUTHOR, now);
	}
</script>

<Base>
	<div class="page">
		<header class="page-header">
			<span class="brand">Demo Host App</span>
			<span class="page-header-hint">
				Fixed app chrome above the editor - the scrollable area below it is shorter than the
				window, like a real host app's main content area.
			</span>
		</header>

		<div class="page-main">
			<p class="note">
				Repro for
				<a href="https://github.com/hyvor/richtext/issues/69" target="_blank">issue #69</a>: this
				scrollable area is shorter than the window (there's a fixed header above it), and the
				editor's content below (with 11 suggestions) is taller than the window on its own. Scroll
				this area and watch the suggestions panel on the left - it should never creep above this
				area's top edge, under the fixed header.
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

			<p class="note">Bottom of the scrollable area.</p>
		</div>
	</div>
</Base>

<style>
	/* app-shell layout: a fixed-height header plus one scrollable main area
	   that's shorter than the window - the editor lives directly in that
	   scrollable area, matching how issue #69 was actually reported (an
	   editor embedded in a host app page, not filling the viewport). */
	.page {
		height: 100vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.page-header {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: 16px;
		height: 56px;
		padding: 0 20px;
		background: #24262b;
		color: #fff;
		box-sizing: border-box;
	}

	.brand {
		font-weight: 700;
	}

	.page-header-hint {
		font-size: 12px;
		opacity: 0.7;
	}

	.page-main {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		max-width: 800px;
		margin: 0 auto;
		padding: 24px 20px 80px;
		box-sizing: border-box;
	}

	.note {
		font-size: 13px;
		color: #555;
		background: #f6f6f6;
		border: 1px solid #e2e2e2;
		border-radius: 8px;
		padding: 10px 14px;
		margin: 0 0 16px;
	}
</style>
