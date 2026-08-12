import type { Mark, Node as PMNode } from 'prosemirror-model';
import type { InlineOp } from './types';
import { levenshteinDiff } from './levenshtein';

interface InlineToken {
	text: string; // '' for an atom token
	marks: readonly Mark[];
	atom?: PMNode; // set for non-text inline nodes (hard_break, ...)
}

// Split into word / punctuation / whitespace runs (keeping every character so
// tokens rejoin losslessly), classed by character type rather than just
// whitespace. This matters because tokens are found independently per text
// child (see below): if "world," were one token, formatting just "world"
// (leaving the attached comma plain) would split that child's text right
// between "world" and "," - a boundary a whitespace-only tokenizer would
// never have produced on its own, so the old side's "world," couldn't line
// up with the new side's "world" + ",". Splitting on character class instead
// puts that boundary in both regardless of where any mark run happens to end.
function tokenizeText(text: string): string[] {
	return text.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]+/gu) ?? [];
}

// Flattens a node's inline content into a stream of word/atom tokens,
// discarding the mark-boundary run structure ProseMirror splits text nodes
// into - that structure changes whenever formatting changes (even mid-word),
// and diffing at that granularity mistakes reformatting for content edits.
function flattenInline(node: PMNode): InlineToken[] {
	const tokens: InlineToken[] = [];
	node.forEach((child) => {
		if (child.isText) {
			for (const word of tokenizeText(child.text ?? '')) {
				tokens.push({ text: word, marks: child.marks });
			}
		} else {
			tokens.push({ text: '', marks: child.marks, atom: child });
		}
	});
	return tokens;
}

function sameMarkSet(a: readonly Mark[], b: readonly Mark[]): boolean {
	return a.length === b.length && a.every((mark, i) => mark.eq(b[i]));
}

// Content equality on purpose ignores marks - mark changes are detected
// separately (as `marksChanged`) once tokens are known to line up.
function tokenContentEqual(a: InlineToken, b: InlineToken): boolean {
	if (a.atom || b.atom) {
		return !!a.atom && !!b.atom && a.atom.type === b.atom.type && JSON.stringify(a.atom.attrs) === JSON.stringify(b.atom.attrs);
	}
	return a.text === b.text;
}

/**
 * Word-level diff of a container's inline content (paragraph, heading, ...).
 * Uses Levenshtein edit distance so a changed word becomes a single "replace"
 * instead of an unrelated delete + insert, and reports mark-only changes
 * (bold/italic/... added with no text change) as `marksChanged` on otherwise-
 * equal tokens instead of as content edits.
 */
export function diffInline(oldNode: PMNode, newNode: PMNode): InlineOp[] {
	const oldTokens = flattenInline(oldNode);
	const newTokens = flattenInline(newNode);

	const edits = levenshteinDiff(oldTokens, newTokens, {
		equal: tokenContentEqual,
		// never pair a text token with an atom token as a "replace" - keep them as separate delete + insert
		substitutionCost: (a, b) => (!!a.atom !== !!b.atom ? Number.POSITIVE_INFINITY : 1)
	});

	const result: InlineOp[] = [];

	for (const edit of edits) {
		if (edit.type === 'equal') {
			const { a, b } = edit;
			if (a.atom && b.atom) {
				result.push({
					type: 'equalAtom',
					oldNode: a.atom,
					newNode: b.atom,
					marksChanged: !sameMarkSet(a.marks, b.marks)
				});
				continue;
			}
			const marksChanged = !sameMarkSet(a.marks, b.marks);
			const last = result[result.length - 1];
			if (last?.type === 'equal' && last.marksChanged === marksChanged) {
				last.text += a.text;
			} else {
				result.push({
					type: 'equal',
					text: a.text,
					marksChanged,
					oldMarks: a.marks,
					newMarks: b.marks
				});
			}
		} else if (edit.type === 'insert') {
			const b = edit.b;
			if (b.atom) {
				result.push({ type: 'insertAtom', node: b.atom });
				continue;
			}
			const last = result[result.length - 1];
			if (last?.type === 'insert') {
				last.text += b.text;
			} else {
				result.push({ type: 'insert', text: b.text, marks: b.marks });
			}
		} else if (edit.type === 'delete') {
			const a = edit.a;
			if (a.atom) {
				result.push({ type: 'deleteAtom', node: a.atom });
				continue;
			}
			const last = result[result.length - 1];
			if (last?.type === 'delete') {
				last.text += a.text;
			} else {
				result.push({ type: 'delete', text: a.text, marks: a.marks });
			}
		} else {
			const { a, b } = edit;
			if (a.atom && b.atom) {
				result.push({ type: 'replaceAtom', oldNode: a.atom, newNode: b.atom });
				continue;
			}
			const last = result[result.length - 1];
			if (last?.type === 'replace') {
				last.oldText += a.text;
				last.newText += b.text;
			} else {
				result.push({
					type: 'replace',
					oldText: a.text,
					newText: b.text,
					oldMarks: a.marks,
					newMarks: b.marks
				});
			}
		}
	}

	return result;
}
