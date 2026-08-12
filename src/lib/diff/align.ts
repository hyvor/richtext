import type { Node as PMNode } from 'prosemirror-model';
import { levenshteinDiff } from './levenshtein';

export interface AlignItem {
	oldNode?: PMNode;
	newNode?: PMNode;
}

const INSERT_COST = 2;
const DELETE_COST = 2;
const TYPE_MISMATCH_COST = 4;
const MIN_SUBSTITUTE_COST = 1;

// Cheap word-overlap distance (0 = same words, 1 = no overlap). Good enough
// to rank candidate pairings without paying for a full text diff on every
// pair the alignment DP considers. Also reused by node.ts to decide whether
// an already-matched pair is similar enough to be worth diffing word-by-word.
export function jaccardDistance(a: string, b: string): number {
	// Note: won't work well with languages with no whitespace between words.
	const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
	const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
	if (wordsA.size === 0 && wordsB.size === 0) return 0;

	let intersection = 0;
	for (const word of wordsA) {
		if (wordsB.has(word)) intersection++;
	}
	const union = wordsA.size + wordsB.size - intersection;
	return union === 0 ? 0 : 1 - intersection / union;
}

/**
 * Cost of pairing two non-equal, same-type nodes as a "substitution" rather
 * than an unrelated delete + insert. Scaled by how similar their text
 * content actually is. a lightly-edited paragraph should align with its old
 * version even when other paragraphs are inserted/deleted around it, rather
 * than tying with (and possibly losing to) an unrelated node at the same
 * cost. A flat cost here can't tell those apart and picks arbitrarily.
 */
function substitutionCost(a: PMNode, b: PMNode): number {
	if (a.type !== b.type) return TYPE_MISMATCH_COST;
	if (a.eq(b)) return 0;

	// leaf/atom nodes (image, audio, ...) have no text content to compare
	if (a.isLeaf || a.isAtom) return MIN_SUBSTITUTE_COST;

	const distance = jaccardDistance(a.textContent, b.textContent);
	return MIN_SUBSTITUTE_COST + distance * (TYPE_MISMATCH_COST - MIN_SUBSTITUTE_COST);
}

/**
 * Aligns a node's children (Levenshtein edit-distance) so an edited node
 * pairs up with its old version - "replace" - instead of appearing as an
 * unrelated delete + insert.
 */
export function alignNodes(oldNodes: PMNode[], newNodes: PMNode[]): AlignItem[] {
	const ops = levenshteinDiff(oldNodes, newNodes, {
		equal: (a, b) => a.eq(b), // same if node type, attrs, children are the same
		substitutionCost,
		insertCost: INSERT_COST,
		deleteCost: DELETE_COST
	});

	return ops.map((op): AlignItem => {
		if (op.type === 'delete') return { oldNode: op.a };
		if (op.type === 'insert') return { newNode: op.b };
		return { oldNode: op.a, newNode: op.b };
	});
}
