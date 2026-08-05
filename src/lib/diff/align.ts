import type { Node as PMNode } from 'prosemirror-model';

export interface AlignItem {
	oldNode?: PMNode;
	newNode?: PMNode;
}

const INSERT_COST = 2;
const DELETE_COST = 2;
const TYPE_MISMATCH_COST = 4;
const SUBSTITUTE_COST = 1;

function substitutionCost(a: PMNode, b: PMNode): number {
	if (a.type !== b.type) return TYPE_MISMATCH_COST;
	if (a.eq(b)) return 0;
	return SUBSTITUTE_COST;
}

/**
 * Weighted sequence alignment (Needleman-Wunsch) over a node's children.
 * Unlike a plain LCS diff, this allows pairing up two non-equal nodes as a
 * "substitution" (matched but different) rather than always splitting into a
 * delete + insert, so e.g. an edited paragraph aligns with its old version
 * instead of appearing as an unrelated delete/insert pair.
 */
export function alignNodes(oldNodes: PMNode[], newNodes: PMNode[]): AlignItem[] {
	const n = oldNodes.length;
	const m = newNodes.length;

	const cost: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
	for (let i = 1; i <= n; i++) cost[i][0] = cost[i - 1][0] + DELETE_COST;
	for (let j = 1; j <= m; j++) cost[0][j] = cost[0][j - 1] + INSERT_COST;

	for (let i = 1; i <= n; i++) {
		for (let j = 1; j <= m; j++) {
			const substitute = cost[i - 1][j - 1] + substitutionCost(oldNodes[i - 1], newNodes[j - 1]);
			const del = cost[i - 1][j] + DELETE_COST;
			const ins = cost[i][j - 1] + INSERT_COST;
			cost[i][j] = Math.min(substitute, del, ins);
		}
	}

	const result: AlignItem[] = [];
	let i = n;
	let j = m;
	while (i > 0 && j > 0) {
		const substitute = cost[i - 1][j - 1] + substitutionCost(oldNodes[i - 1], newNodes[j - 1]);
		if (cost[i][j] === substitute) {
			result.push({ oldNode: oldNodes[i - 1], newNode: newNodes[j - 1] });
			i--;
			j--;
		} else if (cost[i][j] === cost[i - 1][j] + DELETE_COST) {
			result.push({ oldNode: oldNodes[i - 1] });
			i--;
		} else {
			result.push({ newNode: newNodes[j - 1] });
			j--;
		}
	}
	while (i > 0) {
		result.push({ oldNode: oldNodes[i - 1] });
		i--;
	}
	while (j > 0) {
		result.push({ newNode: newNodes[j - 1] });
		j--;
	}

	result.reverse();
	return result;
}
