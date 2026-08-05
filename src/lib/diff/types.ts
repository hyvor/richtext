import type { Mark, Node as PMNode } from 'prosemirror-model';

// from/to are ProseMirror document positions: old* positions are valid in the
// old doc, new* positions are valid in the new doc. They are NOT valid
// against each other, and become stale once any earlier op in the same
// document is applied - apply ops back-to-front (or map through a Mapping)
// if you turn these into a Transaction.
export type InlineOp =
	| {
			type: 'equal';
			text: string;
			marksChanged: boolean;
			oldMarks: readonly Mark[];
			newMarks: readonly Mark[];
			oldFrom: number;
			oldTo: number;
			newFrom: number;
			newTo: number;
	  }
	| { type: 'insert'; text: string; marks: readonly Mark[]; newFrom: number; newTo: number }
	| { type: 'delete'; text: string; marks: readonly Mark[]; oldFrom: number; oldTo: number }
	| {
			type: 'replace';
			oldText: string;
			newText: string;
			oldMarks: readonly Mark[];
			newMarks: readonly Mark[];
			oldFrom: number;
			oldTo: number;
			newFrom: number;
			newTo: number;
	  }
	// non-text inline nodes (hard_break, ...) - treated as a single opaque token, never split
	| {
			type: 'equalAtom';
			oldNode: PMNode;
			newNode: PMNode;
			marksChanged: boolean;
			oldFrom: number;
			oldTo: number;
			newFrom: number;
			newTo: number;
	  }
	| { type: 'insertAtom'; node: PMNode; newFrom: number; newTo: number }
	| { type: 'deleteAtom'; node: PMNode; oldFrom: number; oldTo: number }
	| {
			type: 'replaceAtom';
			oldNode: PMNode;
			newNode: PMNode;
			oldFrom: number;
			oldTo: number;
			newFrom: number;
			newTo: number;
	  };

export type Diff =
	| { type: 'equal'; oldNode: PMNode; newNode: PMNode; oldFrom: number; oldTo: number; newFrom: number; newTo: number }
	| { type: 'insert'; node: PMNode; newFrom: number; newTo: number }
	| { type: 'delete'; node: PMNode; oldFrom: number; oldTo: number }
	| {
			type: 'replace';
			oldNode: PMNode;
			newNode: PMNode;
			oldFrom: number;
			oldTo: number;
			newFrom: number;
			newTo: number;
	  }
	// a node whose content is entirely inline (paragraph, heading, callout, ...) -
	// diffed as one flattened word/atom token stream rather than as discrete
	// children, so a mark change that re-splits ProseMirror's text runs (e.g.
	// bolding part of a sentence) doesn't get mistaken for a content change.
	| {
			type: 'inline';
			oldNode: PMNode;
			newNode: PMNode;
			oldFrom: number;
			oldTo: number;
			newFrom: number;
			newTo: number;
			attrsChanged: boolean;
			operations: InlineOp[];
	  }
	// same-type leaf/atom node (image, audio, embed, ...) whose attrs differ -
	// e.g. image src/width/height. No content to recurse into.
	| {
			type: 'attrs';
			oldNode: PMNode;
			newNode: PMNode;
			oldFrom: number;
			oldTo: number;
			newFrom: number;
			newTo: number;
	  }
	| {
			type: 'container';
			oldNode: PMNode;
			newNode: PMNode;
			oldFrom: number;
			oldTo: number;
			newFrom: number;
			newTo: number;
			// e.g. heading level/id, callout emoji/colors, code_block language - independent of any content/children changes
			attrsChanged: boolean;
			children: Diff[];
	  };
