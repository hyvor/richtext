import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { closeHistory } from "prosemirror-history";
import {
    suggestionsPluginKey,
    SUGGESTIONS_SKIP_META,
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
    const insertType = schema.marks.suggestion_insert;
    const deleteType = schema.marks.suggestion_delete;
    const formatType = schema.marks.suggestion_format;
    if (!insertType && !deleteType && !formatType) return [];

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
        const nodeDelete = node.attrs.suggestionDelete as SuggestionNodeMeta | null | undefined;
        if (nodeDelete && nodeDelete.id) {
            const item = ensure(
                nodeDelete.id,
                { id: nodeDelete.userId, name: nodeDelete.userName },
                pos, pos + node.nodeSize
            );
            item.deletedNodeType = node.type.name;
            return false;
        }

        const nodeInsert = node.attrs.suggestionInsert as SuggestionNodeMeta | null | undefined;
        if (nodeInsert && nodeInsert.id) {
            const item = ensure(
                nodeInsert.id,
                { id: nodeInsert.userId, name: nodeInsert.userName },
                pos, pos + node.nodeSize
            );
            item.insertedNodeType = node.type.name;
            return false;
        }

        const nodeFormat = node.attrs.suggestionFormat as SuggestionFormatNodeMeta | null | undefined;
        if (nodeFormat && nodeFormat.id) {
            const item = ensure(
                nodeFormat.id,
                { id: nodeFormat.userId, name: nodeFormat.userName },
                pos, pos + node.nodeSize
            );
            item.formattedNodeType = node.type.name;
        }

        if (!node.isInline) return true;
        const from = pos, to = pos + node.nodeSize;

        const insertMark = insertType?.isInSet(node.marks);
        if (insertMark) {
            const item = ensure(
                insertMark.attrs.id,
                { id: insertMark.attrs.userId, name: insertMark.attrs.userName },
                from, to
            );
            if (node.isText) item.insertedText += node.text ?? "";
        }

        const deleteMark = deleteType?.isInSet(node.marks);
        if (deleteMark) {
            const item = ensure(
                deleteMark.attrs.id,
                { id: deleteMark.attrs.userId, name: deleteMark.attrs.userName },
                from, to
            );
            if (node.isText) item.deletedText += node.text ?? "";
        }

        const formatMark = formatType?.isInSet(node.marks);
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
    const insertType = schema.marks.suggestion_insert;
    const deleteType = schema.marks.suggestion_delete;
    const formatType = schema.marks.suggestion_format;
    if (!insertType && !deleteType && !formatType) return;

    const tr = state.tr;
    const deleteRanges: { from: number; to: number }[] = [];

    state.doc.descendants((node, pos) => {
        const nodeDelete = node.attrs.suggestionDelete as SuggestionNodeMeta | null | undefined;
        if (nodeDelete && nodeDelete.id === id) {
            if (decision === "accept") {
                deleteRanges.push({ from: pos, to: pos + node.nodeSize });
            } else {
                tr.setNodeAttribute(pos, "suggestionDelete", null);
            }
            return false;
        }

        const nodeInsert = node.attrs.suggestionInsert as SuggestionNodeMeta | null | undefined;
        if (nodeInsert && nodeInsert.id === id) {
            if (decision === "reject") {
                deleteRanges.push({ from: pos, to: pos + node.nodeSize });
            } else {
                tr.setNodeAttribute(pos, "suggestionInsert", null);
            }
            return false;
        }

        const nodeFormat = node.attrs.suggestionFormat as SuggestionFormatNodeMeta | null | undefined;
        if (nodeFormat && nodeFormat.id === id) {
            if (decision === "reject") {
                // fully restore the pre-change attrs (which already have the
                // suggestion attrs themselves nulled out, since that's how they
                // were snapshotted - see withFormatFlag in diff/render.ts)
                tr.setNodeMarkup(pos, undefined, nodeFormat.oldAttrs);
            } else {
                tr.setNodeAttribute(pos, "suggestionFormat", null);
            }
        }

        if (!node.isInline) return true;
        const from = pos, to = pos + node.nodeSize;

        const insertMark = insertType?.isInSet(node.marks);
        const deleteMark = deleteType?.isInSet(node.marks);
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
                if (hasInsert) tr.removeMark(from, to, insertType);
                if (hasDelete) tr.removeMark(from, to, deleteType);
            }
        }

        const formatMark = formatType?.isInSet(node.marks);
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
            tr.removeMark(from, to, formatType);
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
