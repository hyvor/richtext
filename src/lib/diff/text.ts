import type { TextOp } from './types';
import { diffSequence } from './sequence';

// Split into words and whitespace runs, keeping every character so tokens rejoin losslessly.
function tokenize(text: string): string[] {
	return text.split(/(\s+)/).filter((token) => token.length > 0);
}

export function diffText(oldText: string, newText: string): TextOp[] {
	if (oldText === newText) {
		return oldText ? [{ type: 'equal', text: oldText }] : [];
	}

	const ops = diffSequence(tokenize(oldText), tokenize(newText), (x, y) => x === y);

	const result: TextOp[] = [];
	for (const op of ops) {
		const text = op.type === 'insert' ? op.b : op.a;
		const last = result[result.length - 1];
		if (last && last.type === op.type) {
			last.text += text;
		} else {
			result.push({ type: op.type, text });
		}
	}

	return result;
}
