import type { Node as PMNode } from 'prosemirror-model';
import type { Diff } from './types';
import { alignNodes } from './align';
import { diffText } from './text';

function children(node: PMNode): PMNode[] {
	const result: PMNode[] = [];
	node.forEach((child) => result.push(child));
	return result;
}

function sameMarks(a: PMNode, b: PMNode): boolean {
	return a.marks.length === b.marks.length && a.marks.every((mark, i) => mark.eq(b.marks[i]));
}

// oldFrom/newFrom are this node's own position (right before it) in the old/new doc.
export function diffMatchedNode(oldNode: PMNode, newNode: PMNode, oldFrom: number, newFrom: number): Diff {
	const oldTo = oldFrom + oldNode.nodeSize;
	const newTo = newFrom + newNode.nodeSize;

	if (oldNode.eq(newNode)) {
		return { type: 'equal', oldNode, newNode, oldFrom, oldTo, newFrom, newTo };
	}

	if (oldNode.isText && newNode.isText) {
		// text content starts right where the text node itself starts - no opening token
		return {
			type: 'text',
			oldNode,
			newNode,
			oldFrom,
			oldTo,
			newFrom,
			newTo,
			operations: diffText(oldNode.text ?? '', newNode.text ?? '', oldFrom, newFrom),
			marksChanged: !sameMarks(oldNode, newNode)
		};
	}

	// different node types (or one text/one not) can't be meaningfully compared further
	if (oldNode.type !== newNode.type) {
		return { type: 'replace', oldNode, newNode, oldFrom, oldTo, newFrom, newTo };
	}

	// same type, but a leaf/atom (image, audio, toc, ...) - attrs differ, nothing to recurse into
	if (oldNode.isLeaf || oldNode.isAtom) {
		return { type: 'replace', oldNode, newNode, oldFrom, oldTo, newFrom, newTo };
	}

	// same type container (paragraph, blockquote, table cell, etc) - recurse into children.
	// content starts 1 position in, past this node's own opening token.
	return {
		type: 'container',
		oldNode,
		newNode,
		oldFrom,
		oldTo,
		newFrom,
		newTo,
		children: diffChildren(oldNode, newNode, oldFrom + 1, newFrom + 1)
	};
}

// oldContentPos/newContentPos are the position right before oldNode's/newNode's first child.
export function diffChildren(
	oldNode: PMNode,
	newNode: PMNode,
	oldContentPos: number,
	newContentPos: number
): Diff[] {
	const alignment = alignNodes(children(oldNode), children(newNode));

	const result: Diff[] = [];
	let oldPos = oldContentPos;
	let newPos = newContentPos;

	for (const item of alignment) {
		if (item.oldNode && item.newNode) {
			result.push(diffMatchedNode(item.oldNode, item.newNode, oldPos, newPos));
			oldPos += item.oldNode.nodeSize;
			newPos += item.newNode.nodeSize;
		} else if (item.newNode) {
			const newFrom = newPos;
			const newTo = newFrom + item.newNode.nodeSize;
			result.push({ type: 'insert', node: item.newNode, newFrom, newTo });
			newPos = newTo;
		} else if (item.oldNode) {
			const oldFrom = oldPos;
			const oldTo = oldFrom + item.oldNode.nodeSize;
			result.push({ type: 'delete', node: item.oldNode, oldFrom, oldTo });
			oldPos = oldTo;
		}
	}
	return result;
}

/**
 * Diffs two ProseMirror documents, tree-first: block-level children are
 * aligned and matched, then diffed recursively (containers recurse into
 * children, text nodes get a word-level diff, leaf/atom nodes are
 * replaced wholesale). Both docs must come from the same Schema instance.
 *
 * Every op carries positions: fields prefixed "old" are valid against the
 * old doc, fields prefixed "new" are valid against the new doc (not each
 * other), the same way ProseMirror itself addresses positions. A doc's
 * content starts at position 0.
 */
export function diffDoc(oldDoc: PMNode, newDoc: PMNode): Diff[] {
	return diffChildren(oldDoc, newDoc, 0, 0);
}
