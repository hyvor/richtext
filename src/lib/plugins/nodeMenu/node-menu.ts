import type { Node, ResolvedPos } from "prosemirror-model";
import { NodeSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { writable } from "svelte/store";

/**
 * Position (in the doc) right in front of the top-level block that the
 * pointer is currently over (or, while dragging, the block being targeted
 * as the drop location). `null` when the pointer isn't over any block.
 */
export const nodeMenuPos = writable<null | number>(null);

/**
 * Resolves any position in the document to the position right in front of
 * the top-level (depth 1) block that contains it, so hovering/clicking
 * anywhere inside a node - an image inside a <figure>, text inside a list
 * or table cell, a figcaption, etc. - resolves to the block that should
 * actually be shown/dragged as a whole.
 */
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
 * Both positions must point directly in front of a top-level block, e.g. as
 * returned by topLevelBlockPosAt().
 *
 * This dispatches a plain delete-then-insert transaction; if the suggestions
 * plugin is active in "suggesting" mode, it intercepts this (like any other
 * transaction) and rewrites it into a pending delete/insert suggestion pair -
 * see plugin-suggestions.ts.
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
