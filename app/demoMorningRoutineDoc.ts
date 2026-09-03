// Shared demo content for the repro pages under app/ - a ~9 paragraph doc
// with a spread of insert/delete/replace suggestions already baked in (built
// by hand rather than round-tripped through real "suggesting"-mode edits, so
// suggestion ids/authors are known up front and can be seeded into a
// SuggestionSource before the editor ever mounts - see ScrollTestPage.svelte
// and ModalTestPage.svelte).

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

export interface MorningRoutineDoc {
	doc: object;
	// in document order - the last id is the one nearest the end of the doc,
	// useful for testing "scroll to the last suggestion" specifically
	suggestionIds: string[];
}

// idPrefix keeps ids unique per page/demo source (they're used as
// localStorage keys via createDemoSuggestionSource)
export function buildMorningRoutineDoc(idPrefix: string): MorningRoutineDoc {
	let idCounter = 0;
	const suggestionIds: string[] = [];
	function nextId(): string {
		idCounter++;
		const id = `${idPrefix}-${idCounter}`;
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
				...replace('usually', 'often'),
				t(' the fastest way to abandon the whole idea within a week. And once it breaks, people rarely '),
				...replace('bother', 'take the time'),
				t(' to start again.')
			])
		]
	};

	return { doc, suggestionIds };
}
