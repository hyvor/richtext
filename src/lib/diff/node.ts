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

function diffMatchedNode(oldNode: PMNode, newNode: PMNode): Diff {
	if (oldNode.eq(newNode)) {
		return { type: 'equal', oldNode, newNode };
	}

	// different node types can't be meaningfully compared further
	if (oldNode.type !== newNode.type) {
		return { type: 'replace', oldNode, newNode };
	}

	// paragraph, heading, callout, figcaption, button, ... - diff inline content as one
	// flattened word/atom token stream rather than as discrete children, since ProseMirror
	// splits text into runs at mark boundaries and that split shifts whenever formatting
	// changes, independent of whether the actual text content changed. Checked before the
	// isLeaf/isAtom test below since an *empty* inline-content node (e.g. an empty
	// paragraph) is technically also "leaf" (content.size === 0).
	if (oldNode.inlineContent) {
		if (jaccardDistance(oldNode.textContent, newNode.textContent) > REWRITE_THRESHOLD) {
			return { type: 'replace', oldNode, newNode };
		}

		return {
			type: 'inline',
			oldNode,
			newNode,
			attrsChanged: !sameAttrs(oldNode, newNode),
			operations: diffInline(oldNode, newNode)
		};
	}

	// same type, but a leaf/atom (image, audio, toc, ...) - only their attrs can differ, nothing to recurse into
	if (oldNode.isLeaf || oldNode.isAtom) {
		return { type: 'attrs', oldNode, newNode };
	}

	// same type container with block content (blockquote, list item, table cell, etc) - recurse into children
	return {
		type: 'container',
		oldNode,
		newNode,
		attrsChanged: !sameAttrs(oldNode, newNode),
		children: diffChildren(oldNode, newNode)
	};
}

function diffChildren(oldNode: PMNode, newNode: PMNode): Diff[] {
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
 * children, inline-content nodes get a word-level diff of their flattened
 * content, leaf/atom nodes are compared by attrs). Both docs must come from
 * the same Schema instance.
 */
export function diffDoc(oldDoc: PMNode, newDoc: PMNode): Diff[] {
	return diffChildren(oldDoc, newDoc);
}
