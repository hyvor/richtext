import type { EditorState } from "prosemirror-state";
import { NodeSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { closeHistory } from "prosemirror-history";
import {
    suggestionsPluginKey,
    SUGGESTIONS_SKIP_META,
    findSuggestionMark,
    getNodeSuggestions,
    withNodeSuggestion,
    withoutNodeSuggestion,
    generateSuggestionId,
    type SuggestionMode,
    type SuggestionSubtype,
    type Author,
    type AuthorInfo,
    type SuggestionReply,
    type SuggestionNodeMeta,
    type SuggestionFormatNodeMeta
} from "./plugin-suggestions";

export type { SuggestionMode, SuggestionSubtype, Author, AuthorInfo, SuggestionReply };

export interface SuggestionItem {
    id: string;
    type: SuggestionSubtype;
    author: Author;
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
    // the reply thread attached to this suggestion/comment - available on
    // every type, not just "comment" (see marks.suggestion in schema.ts)
    comments: SuggestionReply[];
}

export function getSuggestionMode(state: EditorState): SuggestionMode {
    return suggestionsPluginKey.getState(state)?.mode ?? "editing";
}

export function setSuggestionMode(view: EditorView, mode: SuggestionMode) {
    // editing before/after a mode switch shouldn't be undoable as one step -
    // e.g. undoing a suggestion-mode edit shouldn't reach back into edits made
    // while still in plain editing mode
    view.dispatch(closeHistory(view.state.tr).setMeta(suggestionsPluginKey, { mode }));
}

export function getCurrentAuthor(state: EditorState): Author {
    return suggestionsPluginKey.getState(state)?.author ?? "user:";
}

export function setCurrentAuthor(view: EditorView, author: Author) {
    view.dispatch(view.state.tr.setMeta(suggestionsPluginKey, { author }));
}

// Turns an Author id into a display name/picture - see resolveAuthor in
// SuggestionsPluginConfig. Callers (the panel) should cache results
// themselves, since this may hit the network on every call.
export function getResolveAuthor(state: EditorState): (author: Author) => AuthorInfo | Promise<AuthorInfo> {
    return suggestionsPluginKey.getState(state)?.resolveAuthor ?? (() => ({ name: "" }));
}

export function getSuggestions(state: EditorState): SuggestionItem[] {
    const schema = state.schema;
    const suggestionType = schema.marks.suggestion;
    if (!suggestionType) return [];

    const items = new Map<string, SuggestionItem>();

    function ensure(
        id: string, type: SuggestionSubtype, author: Author, comments: SuggestionReply[],
        from: number, to: number
    ): SuggestionItem {
        let item = items.get(id);
        if (!item) {
            item = { id, type, author, from, to, insertedText: "", deletedText: "", formatAdd: [], formatRemove: [], comments };
            items.set(id, item);
        } else {
            item.from = Math.min(item.from, from);
            item.to = Math.max(item.to, to);
        }
        return item;
    }

    state.doc.descendants((node, pos) => {
        // whole-node suggestions/comments (see withSuggestionAttrs in schema.ts) -
        // the entire node is the unit, so don't recurse into a wholly
        // inserted/deleted node's children looking for more (a reformatted or
        // commented-only node's children are still walked, since they may
        // carry their own, independent suggestions/threads)
        const nodeSuggestions = getNodeSuggestions(node);
        for (const ns of nodeSuggestions) {
            const item = ensure(ns.id, ns.type, ns.author, ns.comments, pos, pos + node.nodeSize);
            if (ns.type === "delete") item.deletedNodeType = node.type.name;
            else if (ns.type === "insert") item.insertedNodeType = node.type.name;
            else if (ns.type === "format") item.formattedNodeType = node.type.name;
        }

        const primary = nodeSuggestions.find(s => s.type !== "comment");
        if (primary && primary.type !== "format") return false;

        if (!node.isInline) return true;
        const from = pos, to = pos + node.nodeSize;

        const insertMark = findSuggestionMark(node.marks, suggestionType, "insert");
        if (insertMark) {
            const item = ensure(insertMark.attrs.id, "insert", insertMark.attrs.author, insertMark.attrs.comments, from, to);
            if (node.isText) item.insertedText += node.text ?? "";
        }

        const deleteMark = findSuggestionMark(node.marks, suggestionType, "delete");
        if (deleteMark) {
            const item = ensure(deleteMark.attrs.id, "delete", deleteMark.attrs.author, deleteMark.attrs.comments, from, to);
            if (node.isText) item.deletedText += node.text ?? "";
        }

        const formatMark = findSuggestionMark(node.marks, suggestionType, "format");
        if (formatMark) {
            const item = ensure(formatMark.attrs.id, "format", formatMark.attrs.author, formatMark.attrs.comments, from, to);
            item.formatAdd = formatMark.attrs.add;
            item.formatRemove = (formatMark.attrs.remove as { type: string }[]).map(r => r.type);
        }

        // a range can carry several independent comment threads at once
        // (excludes: "" lets multiple comment-type instances stack) - handle
        // all of them, not just one
        for (const mark of node.marks) {
            if (mark.type !== suggestionType || mark.attrs.type !== "comment") continue;
            ensure(mark.attrs.id, "comment", mark.attrs.author, mark.attrs.comments, from, to);
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
    for (const item of getSuggestions(view.state)) {
        if (item.type === "comment") continue;
        acceptSuggestion(view, item.id);
    }
}

export function rejectAllSuggestions(view: EditorView) {
    for (const item of getSuggestions(view.state)) {
        if (item.type === "comment") continue;
        rejectSuggestion(view, item.id);
    }
}

function resolveSuggestion(view: EditorView, id: string, decision: "accept" | "reject") {
    const { state } = view;
    const schema = state.schema;
    const suggestionType = schema.marks.suggestion;
    if (!suggestionType) return;

    const tr = state.tr;
    const deleteRanges: { from: number; to: number }[] = [];

    state.doc.descendants((node, pos) => {
        const nodeSuggestion = getNodeSuggestions(node).find(s => s.id === id);
        if (nodeSuggestion) {
            if (nodeSuggestion.type === "delete") {
                if (decision === "accept") {
                    deleteRanges.push({ from: pos, to: pos + node.nodeSize });
                } else {
                    tr.setNodeAttribute(pos, "suggestions", withoutNodeSuggestion(node, id));
                }
                return false;
            }

            if (nodeSuggestion.type === "insert") {
                if (decision === "reject") {
                    deleteRanges.push({ from: pos, to: pos + node.nodeSize });
                } else {
                    tr.setNodeAttribute(pos, "suggestions", withoutNodeSuggestion(node, id));
                }
                return false;
            }

            if (nodeSuggestion.type === "format") {
                if (decision === "reject") {
                    // fully restore the pre-change attrs (which already have the
                    // `suggestions` attr itself nulled out, since that's how it was
                    // snapshotted - see markNodeFormatted in diff/render.ts)
                    tr.setNodeMarkup(pos, undefined, (nodeSuggestion as SuggestionFormatNodeMeta).oldAttrs);
                } else {
                    tr.setNodeAttribute(pos, "suggestions", withoutNodeSuggestion(node, id));
                }
            }
            // type === "comment": accept/reject doesn't apply - use resolveComment
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
                // range - insert/delete/format/comment all share the same mark type
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

/**
 * Attaches a new comment thread (type "comment") to the current selection (a
 * text range, or a whole selected node like an image). Returns the new
 * thread's opening SuggestionItem, or null if there's nothing selected / the
 * schema has no suggestion mark. Unlike suggestions, comments are never
 * produced by editing - only by this explicit action (see MarksTooltip's
 * comment button and NodeMenu's "Comment" action).
 */
export function addComment(view: EditorView, text: string): SuggestionItem | null {
    const { state, dispatch } = view;
    const pluginState = suggestionsPluginKey.getState(state);
    if (!pluginState) return null;

    const sel = state.selection;
    if (sel.empty) return null;

    const suggestionType = state.schema.marks.suggestion;
    if (!suggestionType) return null;

    const id = generateSuggestionId();
    const opening: SuggestionReply = {
        id: generateSuggestionId(),
        author: pluginState.author,
        content: text,
        timestamp: Date.now()
    };

    const tr = state.tr;

    if (sel instanceof NodeSelection) {
        const meta: SuggestionNodeMeta = { type: "comment", id, author: pluginState.author, comments: [opening] };
        tr.setNodeAttribute(sel.from, "suggestions", withNodeSuggestion(sel.node, meta));
    } else {
        tr.addMark(sel.from, sel.to, suggestionType.create({
            type: "comment", id, author: pluginState.author, comments: [opening]
        }));
    }

    tr.setMeta(SUGGESTIONS_SKIP_META, true);
    dispatch(tr);

    return {
        id, type: "comment", author: pluginState.author,
        from: sel.from, to: sel.to,
        insertedText: "", deletedText: "", formatAdd: [], formatRemove: [],
        comments: [opening]
    };
}

/**
 * Adds a reply to any suggestion or comment thread's discussion - this is
 * what makes suggestions repliable, not just comments. Patches `comments` on
 * every mark instance / node-attr entry sharing `id` (a suggestion can span
 * several disjoint mark instances, e.g. crossing a bold run).
 */
export function replyToSuggestion(view: EditorView, id: string, text: string): SuggestionReply | null {
    const { state, dispatch } = view;
    const pluginState = suggestionsPluginKey.getState(state);
    if (!pluginState) return null;

    const suggestionType = state.schema.marks.suggestion;
    if (!suggestionType) return null;

    const reply: SuggestionReply = {
        id: generateSuggestionId(),
        author: pluginState.author,
        content: text,
        timestamp: Date.now()
    };

    const tr = state.tr;
    let found = false;

    state.doc.descendants((node, pos) => {
        const list = getNodeSuggestions(node);
        if (list.some(s => s.id === id)) {
            found = true;
            tr.setNodeAttribute(pos, "suggestions", list.map(s =>
                s.id === id ? { ...s, comments: [...s.comments, reply] } : s
            ));
        }

        if (!node.isInline) return true;

        const mark = node.marks.find(m => m.type === suggestionType && m.attrs.id === id);
        if (mark) {
            found = true;
            const from = pos, to = pos + node.nodeSize;
            const updated = suggestionType.create({ ...mark.attrs, comments: [...mark.attrs.comments, reply] });
            tr.removeMark(from, to, mark);
            tr.addMark(from, to, updated);
        }

        return true;
    });

    if (!found) return null;

    tr.setMeta(SUGGESTIONS_SKIP_META, true);
    dispatch(tr);
    return reply;
}

/**
 * Resolves a comment thread (type "comment" only - for suggestions use
 * acceptSuggestion/rejectSuggestion instead): strips its mark/node-attr
 * entries from the document (removing just that thread's highlight, leaving
 * any other overlapping threads/suggestions intact). No content mutation,
 * since a comment never wraps inserted/deleted text.
 */
export function resolveComment(view: EditorView, id: string): void {
    const { state, dispatch } = view;
    const suggestionType = state.schema.marks.suggestion;
    if (!suggestionType) return;

    const tr = state.tr;

    state.doc.descendants((node, pos) => {
        if (getNodeSuggestions(node).some(s => s.id === id && s.type === "comment")) {
            tr.setNodeAttribute(pos, "suggestions", withoutNodeSuggestion(node, id));
        }

        if (!node.isInline) return true;

        const mark = node.marks.find(m => m.type === suggestionType && m.attrs.type === "comment" && m.attrs.id === id);
        if (mark) tr.removeMark(pos, pos + node.nodeSize, mark);

        return true;
    });

    if (tr.steps.length > 0) {
        tr.setMeta(SUGGESTIONS_SKIP_META, true);
        dispatch(tr);
    }
}
