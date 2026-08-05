export type EditOp<T> =
	| { type: 'equal'; a: T; b: T }
	| { type: 'replace'; a: T; b: T }
	| { type: 'insert'; b: T }
	| { type: 'delete'; a: T };

export interface LevenshteinOptions<T> {
	equal: (a: T, b: T) => boolean;
	// cost of matching two non-equal items as a "replace" pair rather than a delete + insert; default 1
	substitutionCost?: (a: T, b: T) => number;
	insertCost?: number; // default 1
	deleteCost?: number; // default 1
}

/**
 * Weighted Levenshtein edit distance (Needleman-Wunsch), computed via O(n*m)
 * dynamic programming and backtracked into the cheapest sequence of
 * equal/insert/delete/replace edits. Unlike a plain LCS diff, this allows two
 * non-equal items to be paired up as a single "replace" rather than always
 * splitting into an unrelated delete + insert.
 */
export function levenshteinDiff<T>(a: T[], b: T[], options: LevenshteinOptions<T>): EditOp<T>[] {
	const { equal, substitutionCost = () => 1, insertCost = 1, deleteCost = 1 } = options;
	const n = a.length;
	const m = b.length;

	const cost: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
	for (let i = 1; i <= n; i++) cost[i][0] = cost[i - 1][0] + deleteCost;
	for (let j = 1; j <= m; j++) cost[0][j] = cost[0][j - 1] + insertCost;

	for (let i = 1; i <= n; i++) {
		for (let j = 1; j <= m; j++) {
			const isEqual = equal(a[i - 1], b[j - 1]);
			const sub = cost[i - 1][j - 1] + (isEqual ? 0 : substitutionCost(a[i - 1], b[j - 1]));
			const del = cost[i - 1][j] + deleteCost;
			const ins = cost[i][j - 1] + insertCost;
			cost[i][j] = Math.min(sub, del, ins);
		}
	}

	const result: EditOp<T>[] = [];
	let i = n;
	let j = m;
	while (i > 0 && j > 0) {
		const isEqual = equal(a[i - 1], b[j - 1]);
		const sub = cost[i - 1][j - 1] + (isEqual ? 0 : substitutionCost(a[i - 1], b[j - 1]));
		if (cost[i][j] === sub) {
			result.push(
				isEqual ? { type: 'equal', a: a[i - 1], b: b[j - 1] } : { type: 'replace', a: a[i - 1], b: b[j - 1] }
			);
			i--;
			j--;
		} else if (cost[i][j] === cost[i - 1][j] + deleteCost) {
			result.push({ type: 'delete', a: a[i - 1] });
			i--;
		} else {
			result.push({ type: 'insert', b: b[j - 1] });
			j--;
		}
	}
	while (i > 0) {
		result.push({ type: 'delete', a: a[i - 1] });
		i--;
	}
	while (j > 0) {
		result.push({ type: 'insert', b: b[j - 1] });
		j--;
	}

	result.reverse();
	return result;
}
