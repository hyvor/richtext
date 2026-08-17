import type { Node, ResolvedPos } from "prosemirror-model";
import { NodeSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { writable } from "svelte/store";

/**
 * Prosemirror pos where the cursor is at.
 * Top-level node only
 */
export const nodeMenuPos = writable<null | number>(null);


export function topLevelBlockPosAt($pos: ResolvedPos): number {
    if ($pos.depth >= 1) {
        return $pos.before(1);
    }

    // depth 0 - $pos already sits exactly between two top-level blocks (or
    // at the very start/end of the doc), since the doc's content is
    // `block+`, so every depth-0 position is a boundary between blocks.
    if ($pos.nodeAfter) {
        return $pos.pos;
    }
    if ($pos.nodeBefore) {
        return $pos.pos - $pos.nodeBefore.nodeSize;
    }
    return $pos.pos;
}

export function deleteNode(view: EditorView, pos: number) {
    const { state, dispatch } = view;
    const node = state.doc.nodeAt(pos);
    if (!node) return;
    dispatch(state.tr.delete(pos, pos + node.nodeSize));
    view.focus();
}

/**
 * Moves the top-level block at `sourcePos` so that it ends up right before
 * (or, if `insertAfter`, right after) the top-level block at `targetPos`.
 * Both positions must point directly in front of a top-level block
 *
 * This dispatches a plain delete-then-insert transaction; if the suggestions
 * plugin is active in "suggesting" mode, it intercepts this (like any other
 * transaction) and rewrites it into a pending delete/insert suggestion pair
 */
export function moveNode(
    view: EditorView,
    sourcePos: number,
    targetPos: number,
    insertAfter: boolean
) {
    const { state } = view;
    const sourceNode = state.doc.nodeAt(sourcePos);
    if (!sourceNode) return;

    const sourceEnd = sourcePos + sourceNode.nodeSize;

    let insertPos = targetPos;
    if (insertAfter) {
        const targetNode = state.doc.nodeAt(targetPos);
        if (!targetNode) return;
        insertPos = targetPos + targetNode.nodeSize;
    }

    // dropped back right where it started - nothing to do
    if (insertPos === sourcePos || insertPos === sourceEnd) return;

    const tr = state.tr;
    tr.delete(sourcePos, sourceEnd);

    const mappedInsertPos = tr.mapping.map(insertPos);
    tr.insert(mappedInsertPos, sourceNode as Node);
    tr.setSelection(NodeSelection.create(tr.doc, mappedInsertPos));

    view.dispatch(tr.scrollIntoView());
    view.focus();
}
