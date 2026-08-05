import type { Node as PMNode } from 'prosemirror-model';

// from/to are ProseMirror document positions: old* positions are valid in the
// old doc, new* positions are valid in the new doc. They are NOT valid
// against each other, and become stale once any earlier op in the same
// document is applied - apply ops back-to-front (or map through a Mapping)
// if you turn these into a Transaction.
export type TextOp =
	| { type: 'equal'; text: string; oldFrom: number; oldTo: number; newFrom: number; newTo: number }
	| { type: 'insert'; text: string; newFrom: number; newTo: number }
	| { type: 'delete'; text: string; oldFrom: number; oldTo: number }
	| {
			type: 'replace';
			oldText: string;
			newText: string;
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
	| {
			type: 'text';
			oldNode: PMNode;
			newNode: PMNode;
			oldFrom: number;
			oldTo: number;
			newFrom: number;
			newTo: number;
			operations: TextOp[];
			marksChanged: boolean;
	  }
	| {
			type: 'container';
			oldNode: PMNode;
			newNode: PMNode;
			oldFrom: number;
			oldTo: number;
			newFrom: number;
			newTo: number;
			children: Diff[];
	  };
