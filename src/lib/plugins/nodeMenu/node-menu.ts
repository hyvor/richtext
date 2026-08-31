import type { Node, ResolvedPos } from "prosemirror-model";
import { NodeSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { writable } from "svelte/store";

export const nodeMenuPos = writable<null | number>(null);


export function topLevelBlockPosAt($pos: ResolvedPos): number {
    if ($pos.depth >= 1) {
        return $pos.before(1);
    }

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

    if (insertPos === sourcePos || insertPos === sourceEnd) return;

    const tr = state.tr;
    tr.delete(sourcePos, sourceEnd);

    const mappedInsertPos = tr.mapping.map(insertPos);
    tr.insert(mappedInsertPos, sourceNode as Node);
    tr.setSelection(NodeSelection.create(tr.doc, mappedInsertPos));

    view.dispatch(tr.scrollIntoView());
    view.focus();
}
