import type { Mark, Node as PMNode } from 'prosemirror-model';

export type InlineOp =
	| { type: 'equal'; text: string; marksChanged: boolean; oldMarks: readonly Mark[]; newMarks: readonly Mark[] }
	| { type: 'insert'; text: string; marks: readonly Mark[] }
	| { type: 'delete'; text: string; marks: readonly Mark[] }
	| { type: 'replace'; oldText: string; newText: string; oldMarks: readonly Mark[]; newMarks: readonly Mark[] }
	// non-text inline nodes (hard_break, ...) - treated as a single opaque token, never split
	| { type: 'equalAtom'; oldNode: PMNode; newNode: PMNode; marksChanged: boolean }
	| { type: 'insertAtom'; node: PMNode }
	| { type: 'deleteAtom'; node: PMNode }
	| { type: 'replaceAtom'; oldNode: PMNode; newNode: PMNode };

export type Diff =
	| { type: 'equal'; oldNode: PMNode; newNode: PMNode }
	| { type: 'insert'; node: PMNode }
	| { type: 'delete'; node: PMNode }
	| { type: 'replace'; oldNode: PMNode; newNode: PMNode }
	// a node whose content is entirely inline (paragraph, heading, callout, ...) -
	// diffed as one flattened word/atom token stream rather than as discrete
	// children, so a mark change that re-splits ProseMirror's text runs (e.g.
	// bolding part of a sentence) doesn't get mistaken for a content change.
	| { type: 'inline'; oldNode: PMNode; newNode: PMNode; attrsChanged: boolean; operations: InlineOp[] }
	// same-type leaf/atom node (image, audio, embed, ...) whose attrs differ -
	// e.g. image src/width/height. No content to recurse into.
	| { type: 'attrs'; oldNode: PMNode; newNode: PMNode }
	| {
			type: 'container';
			oldNode: PMNode;
			newNode: PMNode;
			// e.g. heading level/id, callout emoji/colors, code_block language - independent of any content/children changes
			attrsChanged: boolean;
			children: Diff[];
	  };
