import { Fragment, type Node as PMNode, type Schema } from 'prosemirror-model';
import type { Diff, InlineOp } from './types';

function withDiffMark(node: PMNode, schema: Schema, diffType: 'insert' | 'delete' | 'format'): PMNode {
	const mark = schema.marks.diff.create({ diffType });
	return node.mark(mark.addToSet(node.marks));
}

function inlineOpNodes(op: InlineOp, schema: Schema): PMNode[] {
	switch (op.type) {
		case 'equal':
			// text itself didn't change, but formatting (bold, italic, ...) did -
			// flag it without duplicating the (identical) text
			if (op.marksChanged) {
				return [schema.text(op.text, schema.marks.diff.create({ diffType: 'format' }).addToSet(op.newMarks))];
			}
			return op.text ? [schema.text(op.text, op.newMarks)] : [];
		case 'insert':
			return [schema.text(op.text, schema.marks.diff.create({ diffType: 'insert' }).addToSet(op.marks))];
		case 'delete':
			return [schema.text(op.text, schema.marks.diff.create({ diffType: 'delete' }).addToSet(op.marks))];
		case 'replace':
			// unmarked space between old/new so they don't visually run together
			return [
				schema.text(op.oldText, schema.marks.diff.create({ diffType: 'delete' }).addToSet(op.oldMarks)),
				schema.text(' '),
				schema.text(op.newText, schema.marks.diff.create({ diffType: 'insert' }).addToSet(op.newMarks))
			];
		case 'equalAtom':
			return [op.marksChanged ? withDiffMark(op.newNode, schema, 'format') : op.newNode];
		case 'insertAtom':
			return [withDiffMark(op.node, schema, 'insert')];
		case 'deleteAtom':
			return [withDiffMark(op.node, schema, 'delete')];
		case 'replaceAtom':
			return [withDiffMark(op.oldNode, schema, 'delete'), withDiffMark(op.newNode, schema, 'insert')];
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
			case 'attrs':
				// e.g. image src/width/height, heading level on a leaf-ish node - flag it, show the new state
				result.push(withDiffMark(diff.newNode, schema, 'format'));
				break;
			case 'inline': {
				const content = diff.operations.flatMap((op) => inlineOpNodes(op, schema));
				const merged = diff.newNode.type.create(diff.newNode.attrs, Fragment.from(content), diff.newNode.marks);
				result.push(diff.attrsChanged ? withDiffMark(merged, schema, 'format') : merged);
				break;
			}
			case 'container': {
				const merged = diff.newNode.type.create(
					diff.newNode.attrs,
					Fragment.from(mergeDiffs(diff.children, schema)),
					diff.newNode.marks
				);
				result.push(diff.attrsChanged ? withDiffMark(merged, schema, 'format') : merged);
				break;
			}
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
