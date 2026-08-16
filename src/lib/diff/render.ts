import { Fragment, type Mark, type Node as PMNode, type Schema } from 'prosemirror-model';
import type { Diff, InlineOp } from './types';
import {
	generateSuggestionId,
	withNodeSuggestion,
	type SuggestionSubtype,
	type SuggestionNodeMeta,
	type SuggestionFormatNodeMeta
} from '../plugins/suggestions/plugin-suggestions';

// A generated suggestion's {id, type}, collected as buildDiffDoc runs so the
// caller can attribute the whole batch to an author and seed the suggestions
// plugin's host-backed cache (see seedSuggestionSource in
// plugins/suggestions/commands.ts) - authorship is no longer embedded in the
// document itself (see marks.suggestion in schema.ts), and a two-document
// diff has no per-change authorship of its own to embed anyway.
export interface DiffSuggestionRef {
	id: string;
	type: SuggestionSubtype;
}

function setNodeSuggestion(node: PMNode, meta: SuggestionNodeMeta | SuggestionFormatNodeMeta): PMNode {
	return node.type.create({ ...node.attrs, suggestions: withNodeSuggestion(node, meta) }, node.content, node.marks);
}

// Whole-node variants of the suggestion mark's insert/delete subtypes (see
// withSuggestionAttrs in schema.ts) - used for block/atom nodes that can't
// carry an inline mark (an inserted/deleted paragraph, image, table, ...).
// An explicit id lets a delete+insert pair (a 'replace' diff, where the old
// and new nodes are different types) share one id, so accept/reject treats
// them as a single suggestion - `collect: false` is passed for the second
// half of such a pair, so the shared id is only collected once (see
// mergeDiffs's 'replace' case below).
function markNodeInserted(
	node: PMNode,
	collected: DiffSuggestionRef[],
	id = generateSuggestionId(),
	collect = true
): PMNode {
	if (collect) collected.push({ id, type: 'insert' });
	return setNodeSuggestion(node, { type: 'insert', id });
}

function markNodeDeleted(
	node: PMNode,
	collected: DiffSuggestionRef[],
	id = generateSuggestionId(),
	collect = true
): PMNode {
	if (collect) collected.push({ id, type: 'delete' });
	return setNodeSuggestion(node, { type: 'delete', id });
}

// Whole-node variant of the suggestion mark's format subtype, for a
// same-type node whose attrs changed (an image resize, a heading level
// change, ...) rather than its content. Snapshots oldNode's attrs (with the
// `suggestions` attr itself nulled out, since it didn't apply before this
// change) so a reject can restore them exactly.
function markNodeFormatted(newNode: PMNode, oldNode: PMNode, collected: DiffSuggestionRef[]): PMNode {
	const oldAttrs = {
		...oldNode.attrs,
		suggestions: null
	};
	const id = generateSuggestionId();
	collected.push({ id, type: 'format' });
	return setNodeSuggestion(newNode, { type: 'format', id, oldAttrs });
}

// Which mark types were added/removed going from oldMarks to newMarks, in the
// shape the suggestion mark's format-subtype add/remove attrs expect (see schema.ts).
function markDelta(oldMarks: readonly Mark[], newMarks: readonly Mark[]) {
	const add = newMarks.filter((m) => !oldMarks.some((om) => om.eq(m))).map((m) => m.type.name);
	const remove = oldMarks
		.filter((m) => !newMarks.some((nm) => nm.eq(m)))
		.map((m) => ({ type: m.type.name, attrs: m.attrs }));
	return { add, remove };
}

function inlineOpNodes(op: InlineOp, schema: Schema, collected: DiffSuggestionRef[]): PMNode[] {
	const suggestionType = schema.marks.suggestion;

	switch (op.type) {
		case 'equal':
			// text itself didn't change, but formatting (bold, italic, ...) did -
			// flag it without duplicating the (identical) text
			if (op.marksChanged) {
				const { add, remove } = markDelta(op.oldMarks, op.newMarks);
				const id = generateSuggestionId();
				collected.push({ id, type: 'format' });
				const mark = suggestionType.create({ type: 'format', id, add, remove });
				return op.text ? [schema.text(op.text, mark.addToSet(op.newMarks))] : [];
			}
			return op.text ? [schema.text(op.text, op.newMarks)] : [];
		case 'insert': {
			const id = generateSuggestionId();
			collected.push({ id, type: 'insert' });
			const mark = suggestionType.create({ type: 'insert', id });
			return [schema.text(op.text, mark.addToSet(op.marks))];
		}
		case 'delete': {
			const id = generateSuggestionId();
			collected.push({ id, type: 'delete' });
			const mark = suggestionType.create({ type: 'delete', id });
			return [schema.text(op.text, mark.addToSet(op.marks))];
		}
		case 'replace': {
			// shared id so accept/reject resolves the old/new pair as one suggestion.
			// No literal space between old/new text: an unmarked space node would
			// carry no suggestion mark of its own, so it would survive both accept
			// and reject untouched and leave a stray/doubled space behind in the
			// final doc. The visual gap between them is done in CSS instead (see
			// `del.suggestion-delete + ins.suggestion-insert` in Editor.svelte).
			const id = generateSuggestionId();
			collected.push({ id, type: 'delete' });
			const delMark = suggestionType.create({ type: 'delete', id });
			const insMark = suggestionType.create({ type: 'insert', id });
			return [
				schema.text(op.oldText, delMark.addToSet(op.oldMarks)),
				schema.text(op.newText, insMark.addToSet(op.newMarks))
			];
		}
		case 'equalAtom':
			if (op.marksChanged) {
				const { add, remove } = markDelta(op.oldNode.marks, op.newNode.marks);
				const id = generateSuggestionId();
				collected.push({ id, type: 'format' });
				const mark = suggestionType.create({ type: 'format', id, add, remove });
				return [op.newNode.mark(mark.addToSet(op.newNode.marks))];
			}
			return [op.newNode];
		case 'insertAtom': {
			const id = generateSuggestionId();
			collected.push({ id, type: 'insert' });
			const mark = suggestionType.create({ type: 'insert', id });
			return [op.node.mark(mark.addToSet(op.node.marks))];
		}
		case 'deleteAtom': {
			const id = generateSuggestionId();
			collected.push({ id, type: 'delete' });
			const mark = suggestionType.create({ type: 'delete', id });
			return [op.node.mark(mark.addToSet(op.node.marks))];
		}
		case 'replaceAtom': {
			const id = generateSuggestionId();
			collected.push({ id, type: 'delete' });
			const delMark = suggestionType.create({ type: 'delete', id });
			const insMark = suggestionType.create({ type: 'insert', id });
			return [
				op.oldNode.mark(delMark.addToSet(op.oldNode.marks)),
				op.newNode.mark(insMark.addToSet(op.newNode.marks))
			];
		}
	}
}

function mergeDiffs(diffs: Diff[], schema: Schema, collected: DiffSuggestionRef[]): PMNode[] {
	const result: PMNode[] = [];

	for (const diff of diffs) {
		switch (diff.type) {
			case 'equal':
				result.push(diff.newNode);
				break;
			case 'insert':
				result.push(markNodeInserted(diff.node, collected));
				break;
			case 'delete':
				result.push(markNodeDeleted(diff.node, collected));
				break;
			case 'replace': {
				const id = generateSuggestionId();
				result.push(markNodeDeleted(diff.oldNode, collected, id));
				result.push(markNodeInserted(diff.newNode, collected, id, false));
				break;
			}
			case 'attrs':
				// e.g. image src/width/height, heading level on a leaf-ish node - flag it, show the new state
				result.push(markNodeFormatted(diff.newNode, diff.oldNode, collected));
				break;
			case 'inline': {
				const content = diff.operations.flatMap((op) => inlineOpNodes(op, schema, collected));
				const merged = diff.newNode.type.create(diff.newNode.attrs, Fragment.from(content), diff.newNode.marks);
				result.push(diff.attrsChanged ? markNodeFormatted(merged, diff.oldNode, collected) : merged);
				break;
			}
			case 'container': {
				const merged = diff.newNode.type.create(
					diff.newNode.attrs,
					Fragment.from(mergeDiffs(diff.children, schema, collected)),
					diff.newNode.marks
				);
				result.push(diff.attrsChanged ? markNodeFormatted(merged, diff.oldNode, collected) : merged);
				break;
			}
		}
	}

	return result;
}

/**
 * Builds a single ProseMirror document from a diff: inserted content is kept
 * and marked with the suggestion mark's "insert" subtype (or, for a whole
 * inserted node, a `suggestions` attr entry of type "insert"), deleted content
 * is kept in place and marked "delete" (or a `suggestions` attr entry of type
 * "delete") - a track-changes style merged view of both documents, using the
 * same mark/attr as the live suggestion-mode plugin (see
 * src/lib/plugins/suggestions), so the result can be shown in an editable
 * editor with that plugin attached and reviewed (accepted/rejected) exactly
 * like a live-typed suggestion. Must use the same Schema instance the diff
 * was computed with.
 *
 * No author is embedded (the schema no longer carries one - see
 * marks.suggestion in schema.ts) - the returned `suggestions` list lets the
 * caller attribute the whole batch and seed the suggestions plugin's cache,
 * e.g. via seedSuggestionSource(view, suggestions.map(s => ({...s, author}))).
 */
export function buildDiffDoc(diffs: Diff[], schema: Schema): { doc: PMNode; suggestions: DiffSuggestionRef[] } {
	const suggestions: DiffSuggestionRef[] = [];
	const doc = schema.topNodeType.create(null, Fragment.from(mergeDiffs(diffs, schema, suggestions)));
	return { doc, suggestions };
}
