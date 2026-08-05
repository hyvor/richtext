export type SequenceOp<T> =
	| { type: 'equal'; a: T; b: T }
	| { type: 'insert'; b: T }
	| { type: 'delete'; a: T };

/**
 * Classic LCS-based diff: only equal/insert/delete, no substitution.
 * Used for word-level text diffing where "replace" isn't a distinct concept.
 */
export function diffSequence<T>(
	a: T[],
	b: T[],
	equal: (x: T, y: T) => boolean
): SequenceOp<T>[] {
	const n = a.length;
	const m = b.length;

	const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			dp[i][j] = equal(a[i], b[j])
				? dp[i + 1][j + 1] + 1
				: Math.max(dp[i + 1][j], dp[i][j + 1]);
		}
	}

	const result: SequenceOp<T>[] = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (equal(a[i], b[j])) {
			result.push({ type: 'equal', a: a[i], b: b[j] });
			i++;
			j++;
		} else if (dp[i + 1][j] >= dp[i][j + 1]) {
			result.push({ type: 'delete', a: a[i] });
			i++;
		} else {
			result.push({ type: 'insert', b: b[j] });
			j++;
		}
	}
	while (i < n) {
		result.push({ type: 'delete', a: a[i] });
		i++;
	}
	while (j < m) {
		result.push({ type: 'insert', b: b[j] });
		j++;
	}

	return result;
}
