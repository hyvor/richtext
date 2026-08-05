import type { TextOp } from './types';
import { levenshteinDiff } from './levenshtein';

// Split into words and whitespace runs, keeping every character so tokens rejoin losslessly.
function tokenize(text: string): string[] {
	return text.split(/(\s+)/).filter((token) => token.length > 0);
}

/**
 * Word-level diff of two text runs, positioned against oldFrom/newFrom (the
 * position of the first character of oldText/newText in their respective
 * docs). Uses Levenshtein edit distance, so a changed word becomes a single
 * "replace" op instead of an unrelated delete + insert pair.
 */
export function diffText(oldText: string, newText: string, oldFrom: number, newFrom: number): TextOp[] {
	const ops = levenshteinDiff(tokenize(oldText), tokenize(newText), {
		equal: (a, b) => a === b
	});

	const result: TextOp[] = [];
	let oldPos = oldFrom;
	let newPos = newFrom;

	for (const op of ops) {
		const last = result[result.length - 1];

		if (op.type === 'equal') {
			const oldTo = oldPos + op.a.length;
			const newTo = newPos + op.b.length;
			if (last && last.type === 'equal') {
				last.text += op.a;
				last.oldTo = oldTo;
				last.newTo = newTo;
			} else {
				result.push({ type: 'equal', text: op.a, oldFrom: oldPos, oldTo, newFrom: newPos, newTo });
			}
			oldPos = oldTo;
			newPos = newTo;
		} else if (op.type === 'replace') {
			const oldTo = oldPos + op.a.length;
			const newTo = newPos + op.b.length;
			if (last && last.type === 'replace') {
				last.oldText += op.a;
				last.newText += op.b;
				last.oldTo = oldTo;
				last.newTo = newTo;
			} else {
				result.push({
					type: 'replace',
					oldText: op.a,
					newText: op.b,
					oldFrom: oldPos,
					oldTo,
					newFrom: newPos,
					newTo
				});
			}
			oldPos = oldTo;
			newPos = newTo;
		} else if (op.type === 'delete') {
			const oldTo = oldPos + op.a.length;
			if (last && last.type === 'delete') {
				last.text += op.a;
				last.oldTo = oldTo;
			} else {
				result.push({ type: 'delete', text: op.a, oldFrom: oldPos, oldTo });
			}
			oldPos = oldTo;
		} else {
			const newTo = newPos + op.b.length;
			if (last && last.type === 'insert') {
				last.text += op.b;
				last.newTo = newTo;
			} else {
				result.push({ type: 'insert', text: op.b, newFrom: newPos, newTo });
			}
			newPos = newTo;
		}
	}

	return result;
}
