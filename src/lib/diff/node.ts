import type { Node as PMNode } from 'prosemirror-model';
import type { Diff } from './types';
import { alignNodes, jaccardDistance } from './align';
import { diffInline } from './inline';

function children(node: PMNode): PMNode[] {
	const result: PMNode[] = [];
	node.forEach((child) => result.push(child));
	return result;
}

// Above this much word-overlap distance, a matched pair counts as "rewritten"
// rather than "edited": a word-by-word diff of two mostly-unrelated sentences
// reads as noise (an alternating wall of replace/equal runs), so it's shown
// as a plain whole-node replace instead. Below it, most of the content
// survived, so a single changed word still gets a precise, minimal inline
// diff instead of the whole line being flagged as changed.
const REWRITE_THRESHOLD = 0.6;

function sameAttrs(a: PMNode, b: PMNode): boolean {
	return JSON.stringify(a.attrs) === JSON.stringify(b.attrs);
}

// oldFrom/newFrom are this node's own position (right before it) in the old/new doc.
export function diffMatchedNode(oldNode: PMNode, newNode: PMNode, oldFrom: number, newFrom: number): Diff {
	const oldTo = oldFrom + oldNode.nodeSize;
	const newTo = newFrom + newNode.nodeSize;

	if (oldNode.eq(newNode)) {
		return { type: 'equal', oldNode, newNode, oldFrom, oldTo, newFrom, newTo };
	}

	// different node types can't be meaningfully compared further
	if (oldNode.type !== newNode.type) {
		return { type: 'replace', oldNode, newNode, oldFrom, oldTo, newFrom, newTo };
	}

	// paragraph, heading, callout, figcaption, button, ... - diff inline content as one
	// flattened word/atom token stream rather than as discrete children, since ProseMirror
	// splits text into runs at mark boundaries and that split shifts whenever formatting
	// changes, independent of whether the actual text content changed. Checked before the
	// isLeaf/isAtom test below since an *empty* inline-content node (e.g. an empty
	// paragraph) is technically also "leaf" (content.size === 0).
	if (oldNode.inlineContent) {
		if (jaccardDistance(oldNode.textContent, newNode.textContent) > REWRITE_THRESHOLD) {
			return { type: 'replace', oldNode, newNode, oldFrom, oldTo, newFrom, newTo };
		}

		return {
			type: 'inline',
			oldNode,
			newNode,
			oldFrom,
			oldTo,
			newFrom,
			newTo,
			attrsChanged: !sameAttrs(oldNode, newNode),
			operations: diffInline(oldNode, newNode, oldFrom + 1, newFrom + 1)
		};
	}

	// same type, but a leaf/atom (image, audio, toc, ...) - only their attrs can differ, nothing to recurse into
	if (oldNode.isLeaf || oldNode.isAtom) {
		return { type: 'attrs', oldNode, newNode, oldFrom, oldTo, newFrom, newTo };
	}

	// same type container with block content (blockquote, list item, table cell, etc) -
	// recurse into children. content starts 1 position in, past this node's own opening token.
	return {
		type: 'container',
		oldNode,
		newNode,
		oldFrom,
		oldTo,
		newFrom,
		newTo,
		attrsChanged: !sameAttrs(oldNode, newNode),
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
 * children, inline-content nodes get a word-level diff of their flattened
 * content, leaf/atom nodes are compared by attrs). Both docs must come from
 * the same Schema instance.
 *
 * Every op carries positions: fields prefixed "old" are valid against the
 * old doc, fields prefixed "new" are valid against the new doc (not each
 * other), the same way ProseMirror itself addresses positions. A doc's
 * content starts at position 0.
 */
export function diffDoc(oldDoc: PMNode, newDoc: PMNode): Diff[] {
	return diffChildren(oldDoc, newDoc, 0, 0);
}
