import type { EditorView } from "prosemirror-view";
import { Selection, type EditorState } from "prosemirror-state";
import { generateFootnoteId } from "./plugin-footnotes";

export interface FootnoteItem {
    id: string;
    number: number;
}

// position just inside a `footnote` node's content, by id
export function findFootnoteItemPos(state: EditorState, id: string): number | null {
    let result: number | null = null;
    state.doc.descendants((node, pos) => {
        if (result !== null) return false;
        if (node.type.name === "footnote" && node.attrs.id === id) {
            result = pos + 1;
        }
        return true;
    });
    return result;
}

// position of a `footnote_ref` node, by id
export function findFootnoteRefPos(state: EditorState, id: string): number | null {
    let result: number | null = null;
    state.doc.descendants((node, pos) => {
        if (result !== null) return false;
        if (node.type.name === "footnote_ref" && node.attrs.id === id) {
            result = pos;
        }
        return true;
    });
    return result;
}

export function jumpToPos(view: EditorView, pos: number) {
    const tr = view.state.tr.setSelection(Selection.near(view.state.doc.resolve(pos)));
    view.dispatch(tr.scrollIntoView());
    view.focus();
}

// inserts a footnote marker right after the current selection (leaving any
// selected text intact), and jumps the cursor into its (empty) body at the
// bottom so the user can start typing immediately.
export function insertFootnote(view: EditorView): boolean {
    const { state, dispatch } = view;
    const refType = state.schema.nodes.footnote_ref;
    if (!refType) return false;

    const id = generateFootnoteId();
    const pos = state.selection.to;

    dispatch(state.tr.insert(pos, refType.create({ id })));

    // the footnotes plugin's appendTransaction has already synced the
    // container by this point, so the new item can be found in view.state
    const itemPos = findFootnoteItemPos(view.state, id);
    if (itemPos !== null) {
        jumpToPos(view, itemPos);
    } else {
        view.focus();
    }

    return true;
}

// footnotes in document order, with their display number (matches the CSS-counter numbering)
export function getFootnotes(state: EditorState): FootnoteItem[] {
    const ids: string[] = [];
    state.doc.descendants((node) => {
        if (node.type.name === "footnotes") return false;
        if (node.type.name === "footnote_ref" && node.attrs.id && !ids.includes(node.attrs.id)) {
            ids.push(node.attrs.id);
        }
        return true;
    });
    return ids.map((id, i) => ({ id, number: i + 1 }));
}
