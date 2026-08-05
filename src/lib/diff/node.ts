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

export function diffMatchedNode(oldNode: PMNode, newNode: PMNode): Diff {
	if (oldNode.eq(newNode)) {
		return { type: 'equal', oldNode, newNode };
	}

	if (oldNode.isText && newNode.isText) {
		return {
			type: 'text',
			oldNode,
			newNode,
			operations: diffText(oldNode.text ?? '', newNode.text ?? ''),
			marksChanged: !sameMarks(oldNode, newNode)
		};
	}

	// different node types (or one text/one not) can't be meaningfully compared further
	if (oldNode.type !== newNode.type) {
		return { type: 'replace', oldNode, newNode };
	}

	// same type, but a leaf/atom (image, audio, toc, ...) - attrs differ, nothing to recurse into
	if (oldNode.isLeaf || oldNode.isAtom) {
		return { type: 'replace', oldNode, newNode };
	}

	// same type container (paragraph, blockquote, table cell, etc) - recurse into children
	return {
		type: 'container',
		oldNode,
		newNode,
		children: diffChildren(oldNode, newNode)
	};
}

export function diffChildren(oldNode: PMNode, newNode: PMNode): Diff[] {
	const alignment = alignNodes(children(oldNode), children(newNode));

	const result: Diff[] = [];
	for (const item of alignment) {
		if (item.oldNode && item.newNode) {
			result.push(diffMatchedNode(item.oldNode, item.newNode));
		} else if (item.newNode) {
			result.push({ type: 'insert', node: item.newNode });
		} else if (item.oldNode) {
			result.push({ type: 'delete', node: item.oldNode });
		}
	}
	return result;
}

/**
 * Diffs two ProseMirror documents, tree-first: block-level children are
 * aligned and matched, then diffed recursively (containers recurse into
 * children, text nodes get a word-level diff, leaf/atom nodes are
 * replaced wholesale). Both docs must come from the same Schema instance.
 */
export function diffDoc(oldDoc: PMNode, newDoc: PMNode): Diff[] {
	return diffChildren(oldDoc, newDoc);
}
