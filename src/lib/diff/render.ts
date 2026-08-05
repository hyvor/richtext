import { Fragment, type Node as PMNode, type Schema } from 'prosemirror-model';
import type { Diff, TextOp } from './types';

function withDiffMark(node: PMNode, schema: Schema, diffType: 'insert' | 'delete'): PMNode {
	const mark = schema.marks.diff.create({ diffType });
	return node.mark(mark.addToSet(node.marks));
}

function textOpNodes(
	op: TextOp,
	oldNode: PMNode,
	newNode: PMNode,
	marksChanged: boolean,
	schema: Schema
): PMNode[] {
	switch (op.type) {
		case 'equal':
			// text itself didn't change, but formatting (bold, italic, ...) did -
			// flag it without duplicating the (identical) text
			if (marksChanged) {
				return [schema.text(op.text, schema.marks.diff.create({ diffType: 'format' }).addToSet(newNode.marks))];
			}
			return [schema.text(op.text, newNode.marks)];
		case 'insert':
			return [schema.text(op.text, schema.marks.diff.create({ diffType: 'insert' }).addToSet(newNode.marks))];
		case 'delete':
			return [schema.text(op.text, schema.marks.diff.create({ diffType: 'delete' }).addToSet(oldNode.marks))];
		case 'replace':
			// unmarked space between old/new so they don't visually run together
			return [
				schema.text(op.oldText, schema.marks.diff.create({ diffType: 'delete' }).addToSet(oldNode.marks)),
				schema.text(' '),
				schema.text(op.newText, schema.marks.diff.create({ diffType: 'insert' }).addToSet(newNode.marks))
			];
	}
}

function mergeDiffs(diffs: Diff[], schema: Schema): PMNode[] {
	const result: PMNode[] = [];

	for (const diff of diffs) {
		switch (diff.type) {
			case 'equal':
				result.push(diff.newNode);
				break;
			case 'insert':
				result.push(withDiffMark(diff.node, schema, 'insert'));
				break;
			case 'delete':
				result.push(withDiffMark(diff.node, schema, 'delete'));
				break;
			case 'replace':
				result.push(withDiffMark(diff.oldNode, schema, 'delete'));
				result.push(withDiffMark(diff.newNode, schema, 'insert'));
				break;
			case 'text':
				for (const op of diff.operations) {
					result.push(...textOpNodes(op, diff.oldNode, diff.newNode, diff.marksChanged, schema));
				}
				break;
			case 'container':
				result.push(
					diff.newNode.type.create(
						diff.newNode.attrs,
						Fragment.from(mergeDiffs(diff.children, schema)),
						diff.newNode.marks
					)
				);
				break;
		}
	}

	return result;
}

/**
 * Builds a single ProseMirror document from a diff: inserted content is kept
 * and marked with the 'diff' mark (diffType: 'insert'), deleted content is
 * kept in place and marked (diffType: 'delete') - a track-changes style
 * merged view of both documents. Must use the same Schema instance the diff
 * was computed with.
 */
export function buildDiffDoc(diffs: Diff[], schema: Schema): PMNode {
	return schema.topNodeType.create(null, Fragment.from(mergeDiffs(diffs, schema)));
}
