import type { Mark, Node as PMNode, Schema } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import type { Diff, InlineOp } from './types';

export type ChangeKind = 'insert' | 'delete' | 'replace' | 'format';

export interface DiffChange {
	// stable within one diff computation (based on tree path) - not stable
	// across edits, since accepting a change reshapes the tree
	id: string;
	kind: ChangeKind;
	label: string;
	// mutates a transaction against the OLD doc to make it match the new doc
	// for this one change; dispatch it on the old doc's own editor view
	apply: (tr: Transaction) => void;
}

function preview(text: string, max = 60): string {
	const trimmed = text.trim();
	return trimmed.length > max ? trimmed.slice(0, max) + '…' : trimmed;
}

function describeNode(node: PMNode): string {
	const text = node.textContent;
	return text ? `"${preview(text)}"` : `[${node.type.name}]`;
}

function diffMarks(oldMarks: readonly Mark[], newMarks: readonly Mark[]) {
	return {
		removed: oldMarks.filter((mark) => !newMarks.some((m) => m.eq(mark))),
		added: newMarks.filter((mark) => !oldMarks.some((m) => m.eq(mark)))
	};
}

function applyMarkDiff(tr: Transaction, from: number, to: number, oldMarks: readonly Mark[], newMarks: readonly Mark[]) {
	const { removed, added } = diffMarks(oldMarks, newMarks);
	for (const mark of removed) tr.removeMark(from, to, mark.type);
	for (const mark of added) tr.addMark(from, to, mark);
}

function inlineOpChange(op: InlineOp, schema: Schema, id: string): DiffChange | null {
	switch (op.type) {
		case 'equal':
			if (!op.marksChanged) return null;
			return {
				id,
				kind: 'format',
				label: `Formatting changed: "${preview(op.text)}"`,
				apply: (tr) => applyMarkDiff(tr, op.oldFrom, op.oldTo, op.oldMarks, op.newMarks)
			};
		case 'insert':
			return {
				id,
				kind: 'insert',
				label: `Added "${preview(op.text)}"`,
				apply: (tr) => tr.insert(op.oldFrom, schema.text(op.text, op.marks))
			};
		case 'delete':
			return {
				id,
				kind: 'delete',
				label: `Removed "${preview(op.text)}"`,
				apply: (tr) => tr.delete(op.oldFrom, op.oldTo)
			};
		case 'replace':
			return {
				id,
				kind: 'replace',
				label: `"${preview(op.oldText)}" → "${preview(op.newText)}"`,
				apply: (tr) => tr.replaceWith(op.oldFrom, op.oldTo, schema.text(op.newText, op.newMarks))
			};
		case 'equalAtom':
			if (!op.marksChanged) return null;
			return {
				id,
				kind: 'format',
				label: `Formatting changed: [${op.newNode.type.name}]`,
				apply: (tr) => tr.replaceWith(op.oldFrom, op.oldTo, op.newNode)
			};
		case 'insertAtom':
			return {
				id,
				kind: 'insert',
				label: `Added [${op.node.type.name}]`,
				apply: (tr) => tr.insert(op.oldFrom, op.node)
			};
		case 'deleteAtom':
			return {
				id,
				kind: 'delete',
				label: `Removed [${op.node.type.name}]`,
				apply: (tr) => tr.delete(op.oldFrom, op.oldTo)
			};
		case 'replaceAtom':
			return {
				id,
				kind: 'replace',
				label: `[${op.oldNode.type.name}] → [${op.newNode.type.name}]`,
				apply: (tr) => tr.replaceWith(op.oldFrom, op.oldTo, op.newNode)
			};
	}
}

function flatten(diffs: Diff[], schema: Schema, newDoc: PMNode, path: string): DiffChange[] {
	const result: DiffChange[] = [];

	diffs.forEach((diff, index) => {
		const id = `${path}.${index}`;

		switch (diff.type) {
			case 'equal':
				break;
			case 'insert':
				result.push({
					id,
					kind: 'insert',
					label: `Added ${describeNode(diff.node)}`,
					apply: (tr) => tr.insert(diff.oldFrom, diff.node)
				});
				break;
			case 'delete':
				result.push({
					id,
					kind: 'delete',
					label: `Removed ${describeNode(diff.node)}`,
					apply: (tr) => tr.delete(diff.oldFrom, diff.oldTo)
				});
				break;
			case 'replace':
				result.push({
					id,
					kind: 'replace',
					label: `${describeNode(diff.oldNode)} → ${describeNode(diff.newNode)}`,
					apply: (tr) => tr.replace(diff.oldFrom, diff.oldTo, newDoc.slice(diff.newFrom, diff.newTo))
				});
				break;
			case 'attrs':
				result.push({
					id,
					kind: 'format',
					label: `${describeNode(diff.oldNode)} attributes changed`,
					apply: (tr) => tr.setNodeMarkup(diff.oldFrom, undefined, diff.newNode.attrs)
				});
				break;
			case 'inline':
				if (diff.attrsChanged) {
					result.push({
						id: `${id}.attrs`,
						kind: 'format',
						label: `${diff.newNode.type.name} attributes changed`,
						apply: (tr) => tr.setNodeMarkup(diff.oldFrom, undefined, diff.newNode.attrs)
					});
				}
				diff.operations.forEach((op, opIndex) => {
					const change = inlineOpChange(op, schema, `${id}.op${opIndex}`);
					if (change) result.push(change);
				});
				break;
			case 'container':
				if (diff.attrsChanged) {
					result.push({
						id: `${id}.attrs`,
						kind: 'format',
						label: `${diff.newNode.type.name} attributes changed`,
						apply: (tr) => tr.setNodeMarkup(diff.oldFrom, undefined, diff.newNode.attrs)
					});
				}
				result.push(...flatten(diff.children, schema, newDoc, id));
				break;
		}
	});

	return result;
}

/**
 * Flattens a diff tree into a linear list of individually acceptable
 * changes (Grammarly-style), in document order. `newDoc` must be the same
 * new-doc node the diff was computed against (for `replace`, whole ranges
 * are pulled from it). Each change's `apply` mutates a transaction created
 * from the OLD doc's own state - dispatch it on that editor's view.
 */
export function flattenDiffChanges(diffs: Diff[], schema: Schema, newDoc: PMNode): DiffChange[] {
	return flatten(diffs, schema, newDoc, '');
}
