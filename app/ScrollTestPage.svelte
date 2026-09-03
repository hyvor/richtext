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
	import { Base } from '@hyvor/design/components';

	const AUTHOR: Author = 'ai';

	function resolveAuthor(author: Author): AuthorInfo {
		if (author === 'ai') return { name: 'AI' };
		return { name: author };
	}

	const schema = getSchema({ suggestions: true });
	const source = createDemoSuggestionSource('scroll-test-suggestions-source');

	// text run helpers - building the doc by hand (rather than round-tripping
	// through real "suggesting"-mode edits) so the suggestion ids/authors are
	// known up front and can be seeded into the source before the editor ever
	// mounts, matching how DiffPage.svelte seeds diffSource.
	function t(text: string) {
		return { type: 'text', text };
	}
	function del(text: string, id: string) {
		return { type: 'text', text, marks: [{ type: 'suggestion', attrs: { type: 'delete', id } }] };
	}
	function ins(text: string, id: string) {
		return { type: 'text', text, marks: [{ type: 'suggestion', attrs: { type: 'insert', id } }] };
	}
	function para(content: unknown[]) {
		return { type: 'paragraph', content };
	}

	let idCounter = 0;
	const suggestionIds: string[] = [];
	function nextId(): string {
		idCounter++;
		const id = `scroll-test-sg-${idCounter}`;
		suggestionIds.push(id);
		return id;
	}
	// a "replace" suggestion is just an adjacent delete+insert mark pair
	// sharing one id - see getSuggestions in commands.ts
	function replace(oldText: string, newText: string) {
		const id = nextId();
		return [del(oldText, id), t(' '), ins(newText, id)];
	}

	const doc = {
		type: 'doc',
		content: [
			para([
				t('Many people try to build the perfect morning routine all at once. They wake up early, '),
				...replace('try to', 'attempt to'),
				t(' exercise, read, meditate, and plan the entire day before breakfast. It sounds productive on paper, but it rarely survives contact with a busy week.')
			]),
			para([
				t('The problem is not '),
				...replace('motivation', 'willpower'),
				t(". It's scope. A routine with eight new habits is eight new things that can fail on any given morning, and one missed step often feels like the whole system has collapsed."),
				ins(' A single missed morning should never feel like failure.', nextId())
			]),
			para([
				t('Instead, begin with one small, almost trivially easy change. '),
				del('Make your bed, or drink a glass of water before coffee.', nextId()),
				t(' Something small enough that skipping it would feel strange, not something that requires discipline to maintain.')
			]),
			para([
				t('Once that one habit feels automatic, usually after a couple of weeks, add a second. This slow, '),
				...replace('boring', 'deliberate'),
				t(' layering is far more durable than trying to overhaul everything on January 1st.')
			]),
			para([
				t('Protecting your attention in the first hour matters just as much as what you physically do. '),
				ins('Checking email or social media first thing in the morning ', nextId()),
				t('hands the direction of your entire day to whoever happens to need something from you.')
			]),
			para([
				t('Decide the night before what the first task of the morning will be. Removing the '),
				...replace('choice', 'decision'),
				t(' in the moment removes the friction that usually causes people to default to their phone instead.')
			]),
			para([
				t('A good morning routine also needs something you actually '),
				...replace('like', 'enjoy'),
				t(", not just things that are good for you. Purely obligatory routines tend to get abandoned the first time life gets stressful, because there's nothing pulling you toward them.")
			]),
			para([
				t('When the routine inevitably breaks, for travel, illness, or just a bad night, treat it as '),
				...replace('a failure', 'a data point'),
				t(' instead. The goal was never a perfect streak, it was building a default you can return to without much thought.')
			]),
			para([
				t("Finally, keep the routine personal. Borrowing someone else's published routine rarely accounts for your commute, your sleep schedule, or your energy levels, and copying it wholesale is "),
				del('usually', nextId()),
				t(' the fastest way to abandon the whole idea within a week.')
			])
		]
	};

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
				editor's content below (with 10 suggestions) is taller than the window on its own. Scroll
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
