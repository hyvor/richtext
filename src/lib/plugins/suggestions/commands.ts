import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { closeHistory } from "prosemirror-history";
import {
    suggestionsPluginKey,
    SUGGESTIONS_SKIP_META,
    findSuggestionMark,
    type SuggestionMode,
    type SuggestionUser,
    type SuggestionNodeMeta,
    type SuggestionFormatNodeMeta
} from "./plugin-suggestions";

export type { SuggestionMode, SuggestionUser };

export interface SuggestionItem {
    id: string;
    user: SuggestionUser;
    from: number;
    to: number;
    insertedText: string;
    deletedText: string;
    formatAdd: string[];
    formatRemove: string[];
    // set instead of insertedText/deletedText/formatAdd+Remove when this
    // suggestion is a whole inserted/deleted/reformatted node (an image, a
    // blockquote, ...) rather than inline text
    insertedNodeType?: string;
    deletedNodeType?: string;
    formattedNodeType?: string;
}

export function getSuggestionMode(state: EditorState): SuggestionMode {
    return suggestionsPluginKey.getState(state)?.mode ?? "editing";
}

export function getSuggestionUser(state: EditorState): SuggestionUser {
    return suggestionsPluginKey.getState(state)?.user ?? { id: "", name: "" };
}

export function setSuggestionMode(view: EditorView, mode: SuggestionMode) {
    // editing before/after a mode switch shouldn't be undoable as one step -
    // e.g. undoing a suggestion-mode edit shouldn't reach back into edits made
    // while still in plain editing mode
    view.dispatch(closeHistory(view.state.tr).setMeta(suggestionsPluginKey, { mode }));
}

export function setSuggestionUser(view: EditorView, user: SuggestionUser) {
    view.dispatch(view.state.tr.setMeta(suggestionsPluginKey, { user }));
}

export function getSuggestions(state: EditorState): SuggestionItem[] {
    const schema = state.schema;
    const suggestionType = schema.marks.suggestion;
    if (!suggestionType) return [];

    const items = new Map<string, SuggestionItem>();

    function ensure(id: string, user: SuggestionUser, from: number, to: number): SuggestionItem {
        let item = items.get(id);
        if (!item) {
            item = { id, user, from, to, insertedText: "", deletedText: "", formatAdd: [], formatRemove: [] };
            items.set(id, item);
        } else {
            item.from = Math.min(item.from, from);
            item.to = Math.max(item.to, to);
        }
        return item;
    }

    state.doc.descendants((node, pos) => {
        // whole-node suggestions (see withSuggestionAttrs in schema.ts) - the
        // entire node is the unit of the suggestion, so don't recurse into an
        // inserted/deleted node's children looking for more (a reformatted
        // node's children are still walked, since they may carry their own,
        // independent suggestions)
        const nodeSuggestion = node.attrs.suggestion as SuggestionNodeMeta | null | undefined;
        if (nodeSuggestion && nodeSuggestion.id) {
            const item = ensure(
                nodeSuggestion.id,
                { id: nodeSuggestion.userId, name: nodeSuggestion.userName },
                pos, pos + node.nodeSize
            );
            if (nodeSuggestion.type === "delete") item.deletedNodeType = node.type.name;
            else if (nodeSuggestion.type === "insert") item.insertedNodeType = node.type.name;
            else item.formattedNodeType = node.type.name;

            if (nodeSuggestion.type !== "format") return false;
        }

        if (!node.isInline) return true;
        const from = pos, to = pos + node.nodeSize;

        const insertMark = findSuggestionMark(node.marks, suggestionType, "insert");
        if (insertMark) {
            const item = ensure(
                insertMark.attrs.id,
                { id: insertMark.attrs.userId, name: insertMark.attrs.userName },
                from, to
            );
            if (node.isText) item.insertedText += node.text ?? "";
        }

        const deleteMark = findSuggestionMark(node.marks, suggestionType, "delete");
        if (deleteMark) {
            const item = ensure(
                deleteMark.attrs.id,
                { id: deleteMark.attrs.userId, name: deleteMark.attrs.userName },
                from, to
            );
            if (node.isText) item.deletedText += node.text ?? "";
        }

        const formatMark = findSuggestionMark(node.marks, suggestionType, "format");
        if (formatMark) {
            const item = ensure(
                formatMark.attrs.id,
                { id: formatMark.attrs.userId, name: formatMark.attrs.userName },
                from, to
            );
            item.formatAdd = formatMark.attrs.add;
            item.formatRemove = (formatMark.attrs.remove as { type: string }[]).map(r => r.type);
        }

        return true;
    });

    return Array.from(items.values()).sort((a, b) => a.from - b.from);
}

export function acceptSuggestion(view: EditorView, id: string) {
    resolveSuggestion(view, id, "accept");
}

export function rejectSuggestion(view: EditorView, id: string) {
    resolveSuggestion(view, id, "reject");
}

export function acceptAllSuggestions(view: EditorView) {
    for (const item of getSuggestions(view.state)) acceptSuggestion(view, item.id);
}

export function rejectAllSuggestions(view: EditorView) {
    for (const item of getSuggestions(view.state)) rejectSuggestion(view, item.id);
}

function resolveSuggestion(view: EditorView, id: string, decision: "accept" | "reject") {
    const { state } = view;
    const schema = state.schema;
    const suggestionType = schema.marks.suggestion;
    if (!suggestionType) return;

    const tr = state.tr;
    const deleteRanges: { from: number; to: number }[] = [];

    state.doc.descendants((node, pos) => {
        const nodeSuggestion = node.attrs.suggestion as SuggestionNodeMeta | null | undefined;
        if (nodeSuggestion && nodeSuggestion.id === id) {
            if (nodeSuggestion.type === "delete") {
                if (decision === "accept") {
                    deleteRanges.push({ from: pos, to: pos + node.nodeSize });
                } else {
                    tr.setNodeAttribute(pos, "suggestion", null);
                }
                return false;
            }

            if (nodeSuggestion.type === "insert") {
                if (decision === "reject") {
                    deleteRanges.push({ from: pos, to: pos + node.nodeSize });
                } else {
                    tr.setNodeAttribute(pos, "suggestion", null);
                }
                return false;
            }

            // type === "format"
            if (decision === "reject") {
                // fully restore the pre-change attrs (which already have the
                // suggestion attr itself nulled out, since that's how it was
                // snapshotted - see markNodeFormatted in diff/render.ts)
                tr.setNodeMarkup(pos, undefined, (nodeSuggestion as SuggestionFormatNodeMeta).oldAttrs);
            } else {
                tr.setNodeAttribute(pos, "suggestion", null);
            }
        }

        if (!node.isInline) return true;
        const from = pos, to = pos + node.nodeSize;

        const insertMark = findSuggestionMark(node.marks, suggestionType, "insert");
        const deleteMark = findSuggestionMark(node.marks, suggestionType, "delete");
        const hasInsert = insertMark?.attrs.id === id;
        const hasDelete = deleteMark?.attrs.id === id;

        if (hasInsert || hasDelete) {
            const removeContent =
                (hasInsert && hasDelete) ||
                (hasInsert && !hasDelete && decision === "reject") ||
                (hasDelete && !hasInsert && decision === "accept");

            if (removeContent) {
                deleteRanges.push({ from, to });
            } else {
                // remove this specific mark instance, not every suggestion mark in
                // range - insert/delete/format all share the same mark type now
                if (hasInsert && insertMark) tr.removeMark(from, to, insertMark);
                if (hasDelete && deleteMark) tr.removeMark(from, to, deleteMark);
            }
        }

        const formatMark = findSuggestionMark(node.marks, suggestionType, "format");
        if (formatMark && formatMark.attrs.id === id) {
            if (decision === "reject") {
                for (const typeName of formatMark.attrs.add as string[]) {
                    const mt = schema.marks[typeName];
                    if (mt) tr.removeMark(from, to, mt);
                }
                for (const removed of formatMark.attrs.remove as { type: string; attrs: Record<string, any> }[]) {
                    const mt = schema.marks[removed.type];
                    if (mt) tr.addMark(from, to, mt.create(removed.attrs));
                }
            }
            tr.removeMark(from, to, formatMark);
        }

        return true;
    });

    for (let i = deleteRanges.length - 1; i >= 0; i--) {
        const r = deleteRanges[i];
        tr.delete(r.from, r.to);
    }

    if (tr.steps.length > 0) {
        tr.setMeta(SUGGESTIONS_SKIP_META, true);
        view.dispatch(tr);
    }
}
