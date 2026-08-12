import { Fragment, type Node as PMNode, type Schema } from 'prosemirror-model';
import { Decoration } from 'prosemirror-view';
import type { Diff, InlineOp } from './types';

export type DiffType = 'insert' | 'delete' | 'format';

function diffAttrs(diffType: DiffType) {
	return { class: `diff-mark diff-mark-${diffType}`, 'data-diff': diffType };
}

function nodeDecoration(pos: number, node: PMNode, diffType: DiffType): Decoration {
	return Decoration.node(pos, pos + node.nodeSize, diffAttrs(diffType));
}

function inlineDecoration(pos: number, length: number, diffType: DiffType): Decoration | null {
	if (length === 0) return null;
	return Decoration.inline(pos, pos + length, diffAttrs(diffType));
}

// Builds the text/atom nodes for one inline diff op, appending any
// decorations for it to `decorations`. `pos` is this op's position in the
// merged (new) document.
function inlineOpNodes(op: InlineOp, schema: Schema, pos: number, decorations: Decoration[]): PMNode[] {
	switch (op.type) {
		case 'equal':
			// text itself didn't change, but formatting (bold, italic, ...) did -
			// flag it without duplicating the (identical) text
			if (op.marksChanged) {
				const deco = inlineDecoration(pos, op.text.length, 'format');
				if (deco) decorations.push(deco);
			}
			return op.text ? [schema.text(op.text, op.newMarks)] : [];
		case 'insert': {
			const deco = inlineDecoration(pos, op.text.length, 'insert');
			if (deco) decorations.push(deco);
			return [schema.text(op.text, op.marks)];
		}
		case 'delete': {
			const deco = inlineDecoration(pos, op.text.length, 'delete');
			if (deco) decorations.push(deco);
			return [schema.text(op.text, op.marks)];
		}
		case 'replace': {
			const deleteDeco = inlineDecoration(pos, op.oldText.length, 'delete');
			if (deleteDeco) decorations.push(deleteDeco);
			// unmarked space between old/new so they don't visually run together
			const insertPos = pos + op.oldText.length + 1;
			const insertDeco = inlineDecoration(insertPos, op.newText.length, 'insert');
			if (insertDeco) decorations.push(insertDeco);
			return [
				schema.text(op.oldText, op.oldMarks),
				schema.text(' '),
				schema.text(op.newText, op.newMarks)
			];
		}
		case 'equalAtom':
			if (op.marksChanged) decorations.push(nodeDecoration(pos, op.newNode, 'format'));
			return [op.newNode];
		case 'insertAtom':
			decorations.push(nodeDecoration(pos, op.node, 'insert'));
			return [op.node];
		case 'deleteAtom':
			decorations.push(nodeDecoration(pos, op.node, 'delete'));
			return [op.node];
		case 'replaceAtom':
			decorations.push(nodeDecoration(pos, op.oldNode, 'delete'));
			decorations.push(nodeDecoration(pos + op.oldNode.nodeSize, op.newNode, 'insert'));
			return [op.oldNode, op.newNode];
	}
}

// Builds the merged sequence of nodes for a list of diffs, appending any
// decorations to `decorations`. `pos` is the position of the first node in
// the merged (new) document; it's a plain local counter, not returned,
// since siblings are tracked by the caller via each built node's nodeSize.
function mergeDiffs(diffs: Diff[], schema: Schema, pos: number, decorations: Decoration[]): PMNode[] {
	const result: PMNode[] = [];

	for (const diff of diffs) {
		switch (diff.type) {
			case 'equal':
				result.push(diff.newNode);
				pos += diff.newNode.nodeSize;
				break;
			case 'insert':
				decorations.push(nodeDecoration(pos, diff.node, 'insert'));
				result.push(diff.node);
				pos += diff.node.nodeSize;
				break;
			case 'delete':
				decorations.push(nodeDecoration(pos, diff.node, 'delete'));
				result.push(diff.node);
				pos += diff.node.nodeSize;
				break;
			case 'replace':
				decorations.push(nodeDecoration(pos, diff.oldNode, 'delete'));
				result.push(diff.oldNode);
				pos += diff.oldNode.nodeSize;
				decorations.push(nodeDecoration(pos, diff.newNode, 'insert'));
				result.push(diff.newNode);
				pos += diff.newNode.nodeSize;
				break;
			case 'attrs':
				// e.g. image src/width/height, heading level on a leaf-ish node - flag it, show the new state
				decorations.push(nodeDecoration(pos, diff.newNode, 'format'));
				result.push(diff.newNode);
				pos += diff.newNode.nodeSize;
				break;
			case 'inline': {
				const content: PMNode[] = [];
				let innerPos = pos + 1; // +1 to enter this node's content
				for (const op of diff.operations) {
					for (const node of inlineOpNodes(op, schema, innerPos, decorations)) {
						content.push(node);
						innerPos += node.nodeSize;
					}
				}
				const merged = diff.newNode.type.create(diff.newNode.attrs, Fragment.from(content), diff.newNode.marks);
				if (diff.attrsChanged) decorations.push(nodeDecoration(pos, merged, 'format'));
				result.push(merged);
				pos += merged.nodeSize;
				break;
			}
			case 'container': {
				const children = mergeDiffs(diff.children, schema, pos + 1, decorations);
				const merged = diff.newNode.type.create(diff.newNode.attrs, Fragment.from(children), diff.newNode.marks);
				if (diff.attrsChanged) decorations.push(nodeDecoration(pos, merged, 'format'));
				result.push(merged);
				pos += merged.nodeSize;
				break;
			}
		}
	}

	return result;
}

export interface DiffDoc {
	doc: PMNode;
	decorations: Decoration[];
}

/**
 * Builds a single ProseMirror document from a diff: inserted content is kept
 * in place, deleted content is kept in place too - a track-changes style
 * merged view of both documents. Must use the same Schema instance the diff
 * was computed with.
 *
 * Returns the merged doc plus the (position-based) decorations flagging the
 * changes - apply them via a plugin (see decorations.ts) rather than
 * inspecting marks on the doc, since none are added to it.
 */
export function buildDiffDoc(diffs: Diff[], schema: Schema): DiffDoc {
	const decorations: Decoration[] = [];
	const content = mergeDiffs(diffs, schema, 0, decorations);
	const doc = schema.topNodeType.create(null, Fragment.from(content));
	return { doc, decorations };
}
