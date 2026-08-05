import type { Node as PMNode } from 'prosemirror-model';

export type TextOp =
	| { type: 'equal'; text: string }
	| { type: 'insert'; text: string }
	| { type: 'delete'; text: string };

export type Diff =
	| { type: 'equal'; oldNode: PMNode; newNode: PMNode }
	| { type: 'insert'; node: PMNode }
	| { type: 'delete'; node: PMNode }
	| { type: 'replace'; oldNode: PMNode; newNode: PMNode }
	| { type: 'text'; oldNode: PMNode; newNode: PMNode; operations: TextOp[]; marksChanged: boolean }
	| { type: 'container'; oldNode: PMNode; newNode: PMNode; children: Diff[] };
