import { Fragment, type Mark, type Node as PMNode, type Schema } from 'prosemirror-model';
import type { Diff, InlineOp } from './types';
import { generateSuggestionId, type SuggestionUser } from '../plugins/suggestions/plugin-suggestions';

// attributed to generated suggestion marks/attrs when the caller doesn't pass
// their own SuggestionUser - renders as a plain "Suggested insertion" etc.
// tooltip (see the mark/attr toDOM in schema.ts and plugin-suggestions.ts)
// rather than "... by <empty name>"
const DEFAULT_DIFF_USER: SuggestionUser = { id: '', name: '' };

function setSuggestionAttr(node: PMNode, attr: 'suggestionInsert' | 'suggestionDelete' | 'suggestionFormat', value: unknown): PMNode {
	return node.type.create({ ...node.attrs, [attr]: value }, node.content, node.marks);
}

// Whole-node variants of the suggestion_insert/suggestion_delete marks (see
// withSuggestionAttrs in schema.ts) - used for block/atom nodes that can't
// carry an inline mark (an inserted/deleted paragraph, image, table, ...).
// An explicit id lets a delete+insert pair (a 'replace' diff, where the old
// and new nodes are different types) share one id, so accept/reject treats
// them as a single suggestion.
function markNodeInserted(node: PMNode, user: SuggestionUser, id = generateSuggestionId()): PMNode {
	return setSuggestionAttr(node, 'suggestionInsert', { id, userId: user.id, userName: user.name });
}

function markNodeDeleted(node: PMNode, user: SuggestionUser, id = generateSuggestionId()): PMNode {
	return setSuggestionAttr(node, 'suggestionDelete', { id, userId: user.id, userName: user.name });
}

// Whole-node variant of the suggestion_format mark, for a same-type node
// whose attrs changed (an image resize, a heading level change, ...) rather
// than its content. Snapshots oldNode's attrs (with the suggestion attrs
// themselves nulled out, since they didn't apply before this change) so a
// reject can restore them exactly.
function markNodeFormatted(newNode: PMNode, oldNode: PMNode, user: SuggestionUser): PMNode {
	const oldAttrs = {
		...oldNode.attrs,
		suggestionInsert: null,
		suggestionDelete: null,
		suggestionFormat: null
	};
	return setSuggestionAttr(newNode, 'suggestionFormat', {
		id: generateSuggestionId(),
		userId: user.id,
		userName: user.name,
		oldAttrs
	});
}

// Which mark types were added/removed going from oldMarks to newMarks, in the
// shape the suggestion_format mark's add/remove attrs expect (see schema.ts).
function markDelta(oldMarks: readonly Mark[], newMarks: readonly Mark[]) {
	const add = newMarks.filter((m) => !oldMarks.some((om) => om.eq(m))).map((m) => m.type.name);
	const remove = oldMarks
		.filter((m) => !newMarks.some((nm) => nm.eq(m)))
		.map((m) => ({ type: m.type.name, attrs: m.attrs }));
	return { add, remove };
}

function inlineOpNodes(op: InlineOp, schema: Schema, user: SuggestionUser): PMNode[] {
	const insertType = schema.marks.suggestion_insert;
	const deleteType = schema.marks.suggestion_delete;
	const formatType = schema.marks.suggestion_format;

	switch (op.type) {
		case 'equal':
			// text itself didn't change, but formatting (bold, italic, ...) did -
			// flag it without duplicating the (identical) text
			if (op.marksChanged) {
				const { add, remove } = markDelta(op.oldMarks, op.newMarks);
				const mark = formatType.create({
					id: generateSuggestionId(),
					userId: user.id,
					userName: user.name,
					add,
					remove
				});
				return op.text ? [schema.text(op.text, mark.addToSet(op.newMarks))] : [];
			}
			return op.text ? [schema.text(op.text, op.newMarks)] : [];
		case 'insert': {
			const mark = insertType.create({ id: generateSuggestionId(), userId: user.id, userName: user.name });
			return [schema.text(op.text, mark.addToSet(op.marks))];
		}
		case 'delete': {
			const mark = deleteType.create({ id: generateSuggestionId(), userId: user.id, userName: user.name });
			return [schema.text(op.text, mark.addToSet(op.marks))];
		}
		case 'replace': {
			// shared id so accept/reject resolves the old/new pair as one suggestion;
			// unmarked space between them so they don't visually run together
			const id = generateSuggestionId();
			const delMark = deleteType.create({ id, userId: user.id, userName: user.name });
			const insMark = insertType.create({ id, userId: user.id, userName: user.name });
			return [
				schema.text(op.oldText, delMark.addToSet(op.oldMarks)),
				schema.text(' '),
				schema.text(op.newText, insMark.addToSet(op.newMarks))
			];
		}
		case 'equalAtom':
			if (op.marksChanged) {
				const { add, remove } = markDelta(op.oldNode.marks, op.newNode.marks);
				const mark = formatType.create({
					id: generateSuggestionId(),
					userId: user.id,
					userName: user.name,
					add,
					remove
				});
				return [op.newNode.mark(mark.addToSet(op.newNode.marks))];
			}
			return [op.newNode];
		case 'insertAtom': {
			const mark = insertType.create({ id: generateSuggestionId(), userId: user.id, userName: user.name });
			return [op.node.mark(mark.addToSet(op.node.marks))];
		}
		case 'deleteAtom': {
			const mark = deleteType.create({ id: generateSuggestionId(), userId: user.id, userName: user.name });
			return [op.node.mark(mark.addToSet(op.node.marks))];
		}
		case 'replaceAtom': {
			const id = generateSuggestionId();
			const delMark = deleteType.create({ id, userId: user.id, userName: user.name });
			const insMark = insertType.create({ id, userId: user.id, userName: user.name });
			return [
				op.oldNode.mark(delMark.addToSet(op.oldNode.marks)),
				op.newNode.mark(insMark.addToSet(op.newNode.marks))
			];
		}
	}
}

function mergeDiffs(diffs: Diff[], schema: Schema, user: SuggestionUser): PMNode[] {
	const result: PMNode[] = [];

	for (const diff of diffs) {
		switch (diff.type) {
			case 'equal':
				result.push(diff.newNode);
				break;
			case 'insert':
				result.push(markNodeInserted(diff.node, user));
				break;
			case 'delete':
				result.push(markNodeDeleted(diff.node, user));
				break;
			case 'replace': {
				const id = generateSuggestionId();
				result.push(markNodeDeleted(diff.oldNode, user, id));
				result.push(markNodeInserted(diff.newNode, user, id));
				break;
			}
			case 'attrs':
				// e.g. image src/width/height, heading level on a leaf-ish node - flag it, show the new state
				result.push(markNodeFormatted(diff.newNode, diff.oldNode, user));
				break;
			case 'inline': {
				const content = diff.operations.flatMap((op) => inlineOpNodes(op, schema, user));
				const merged = diff.newNode.type.create(diff.newNode.attrs, Fragment.from(content), diff.newNode.marks);
				result.push(diff.attrsChanged ? markNodeFormatted(merged, diff.oldNode, user) : merged);
				break;
			}
			case 'container': {
				const merged = diff.newNode.type.create(
					diff.newNode.attrs,
					Fragment.from(mergeDiffs(diff.children, schema, user)),
					diff.newNode.marks
				);
				result.push(diff.attrsChanged ? markNodeFormatted(merged, diff.oldNode, user) : merged);
				break;
			}
		}
	}

	return result;
}

/**
 * Builds a single ProseMirror document from a diff: inserted content is kept
 * and marked as a suggestion_insert (or, for a whole inserted node, a
 * suggestionInsert attr), deleted content is kept in place and marked
 * suggestion_delete (or suggestionDelete) - a track-changes style merged view
 * of both documents, using the same marks/attrs as the live suggestion-mode
 * plugin (see src/lib/plugins/suggestions), so the result can be shown in an
 * editable editor with that plugin attached and reviewed (accepted/rejected)
 * exactly like a live-typed suggestion. Must use the same Schema instance the
 * diff was computed with.
 *
 * `user` is attributed to every generated suggestion (there's no per-change
 * authorship in a two-document diff); defaults to an unnamed/anonymous user.
 */
export function buildDiffDoc(diffs: Diff[], schema: Schema, user: SuggestionUser = DEFAULT_DIFF_USER): PMNode {
	return schema.topNodeType.create(null, Fragment.from(mergeDiffs(diffs, schema, user)));
}
