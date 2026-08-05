import type { Node as PMNode } from 'prosemirror-model';
import { levenshteinDiff } from './levenshtein';

export interface AlignItem {
	oldNode?: PMNode;
	newNode?: PMNode;
}

const INSERT_COST = 2;
const DELETE_COST = 2;
const TYPE_MISMATCH_COST = 4;
const SUBSTITUTE_COST = 1;

/**
 * Aligns a node's children (Levenshtein edit-distance) so an edited node
 * pairs up with its old version - "replace" - instead of appearing as an
 * unrelated delete + insert.
 */
export function alignNodes(oldNodes: PMNode[], newNodes: PMNode[]): AlignItem[] {
	const ops = levenshteinDiff(oldNodes, newNodes, {
		equal: (a, b) => a.eq(b),
		substitutionCost: (a, b) => (a.type !== b.type ? TYPE_MISMATCH_COST : SUBSTITUTE_COST),
		insertCost: INSERT_COST,
		deleteCost: DELETE_COST
	});

	return ops.map((op): AlignItem => {
		if (op.type === 'delete') return { oldNode: op.a };
		if (op.type === 'insert') return { newNode: op.b };
		return { oldNode: op.a, newNode: op.b };
	});
}
