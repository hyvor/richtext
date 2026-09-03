import type { EditorState } from "prosemirror-state";
import { NodeSelection, TextSelection } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
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
    type SuggestionFormatNodeMeta,
    type SuggestionEvent
} from "./plugin-suggestions";

export type { SuggestionMode, SuggestionSubtype, Author, AuthorInfo, SuggestionReply };

export interface SuggestionItem {
    id: string;
    type: SuggestionSubtype;
    author: Author | null;
    timestamp: number | null;
    from: number;
    to: number;
    insertedText: string;
    deletedText: string;
    formatAdd: string[];
    formatRemove: string[];
    insertedNodeType?: string;
    deletedNodeType?: string;
    formattedNodeType?: string;
    insertedNodeText?: string;
    deletedNodeText?: string;
    comments: SuggestionReply[];
}

export function getSuggestionMode(state: EditorState): SuggestionMode {
    return suggestionsPluginKey.getState(state)?.mode ?? "editing";
}

export function setSuggestionMode(view: EditorView, mode: SuggestionMode) {
    view.dispatch(closeHistory(view.state.tr).setMeta(suggestionsPluginKey, { mode }));
}

export function getCurrentAuthor(state: EditorState): Author {
    return suggestionsPluginKey.getState(state)?.author ?? "user:";
}

export function setCurrentAuthor(view: EditorView, author: Author) {
    view.dispatch(view.state.tr.setMeta(suggestionsPluginKey, { author }));
}

export function isCommentingDisabled(state: EditorState): boolean {
    return suggestionsPluginKey.getState(state)?.disableCommenting ?? false;
}

export function setCommentingDisabled(view: EditorView, disableCommenting: boolean) {
    view.dispatch(view.state.tr.setMeta(suggestionsPluginKey, { disableCommenting }));
}

export function getResolveAuthor(state: EditorState): (author: Author) => AuthorInfo | Promise<AuthorInfo> {
    return suggestionsPluginKey.getState(state)?.resolveAuthor ?? (() => ({ name: "" }));
}

export function getSuggestions(state: EditorState): SuggestionItem[] {
    const schema = state.schema;
    const suggestionType = schema.marks.suggestion;
    if (!suggestionType) return [];

    const cache = suggestionsPluginKey.getState(state)?.cache ?? {};

    const items = new Map<string, SuggestionItem>();

    function ensure(id: string, type: SuggestionSubtype, from: number, to: number): SuggestionItem {
        let item = items.get(id);
        if (!item) {
            const cached = cache[id];
            item = {
                id, type, author: cached?.author ?? null, timestamp: cached?.timestamp ?? null, from, to,
                insertedText: "", deletedText: "", formatAdd: [], formatRemove: [],
                comments: cached?.comments ?? []
            };
            items.set(id, item);
        } else {
            item.from = Math.min(item.from, from);
            item.to = Math.max(item.to, to);
        }
        return item;
    }

    state.doc.descendants((node, pos) => {
        const nodeSuggestions = getNodeSuggestions(node);
        for (const ns of nodeSuggestions) {
            const item = ensure(ns.id, ns.type, pos, pos + node.nodeSize);
            const text = node.textContent.trim();
            if (ns.type === "delete") {
                item.deletedNodeType = node.type.name;
                if (text) item.deletedNodeText = text;
            } else if (ns.type === "insert") {
                item.insertedNodeType = node.type.name;
                if (text) item.insertedNodeText = text;
            } else if (ns.type === "format") item.formattedNodeType = node.type.name;
        }

        const primary = nodeSuggestions.find(s => s.type !== "comment");
        if (primary && primary.type !== "format") return false;

        if (!node.isInline) return true;
        const from = pos, to = pos + node.nodeSize;

        const insertMark = findSuggestionMark(node.marks, suggestionType, "insert");
        if (insertMark) {
            const item = ensure(insertMark.attrs.id, "insert", from, to);
            if (node.isText) item.insertedText += node.text ?? "";
        }

        const deleteMark = findSuggestionMark(node.marks, suggestionType, "delete");
        if (deleteMark) {
            const item = ensure(deleteMark.attrs.id, "delete", from, to);
            if (node.isText) item.deletedText += node.text ?? "";
        }

        const formatMark = findSuggestionMark(node.marks, suggestionType, "format");
        if (formatMark) {
            const item = ensure(formatMark.attrs.id, "format", from, to);
            item.formatAdd = formatMark.attrs.add;
            item.formatRemove = (formatMark.attrs.remove as { type: string }[]).map(r => r.type);
        }

        for (const mark of node.marks) {
            if (mark.type !== suggestionType || mark.attrs.type !== "comment") continue;
            ensure(mark.attrs.id, "comment", from, to);
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

export function resolveAllComments(view: EditorView) {
    for (const item of getSuggestions(view.state)) {
        if (item.type !== "comment") continue;
        resolveComment(view, item.id);
    }
}

function focusAdjacentItem(tr: Transaction, items: SuggestionItem[], id: string) {
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) return;
    const next = items[idx + 1] ?? items[idx - 1];
    if (!next) return;
    const pos = Math.max(0, Math.min(tr.mapping.map(next.from), tr.doc.content.size));
    tr.setSelection(TextSelection.near(tr.doc.resolve(pos)));
}

function resolveSuggestion(view: EditorView, id: string, decision: "accept" | "reject") {
    const { state } = view;
    const schema = state.schema;
    const suggestionType = schema.marks.suggestion;
    if (!suggestionType) return;

    const items = getSuggestions(state);
    const tr = state.tr;
    const deleteRanges: { from: number; to: number }[] = [];
    let found = false;

    state.doc.descendants((node, pos) => {
        const nodeSuggestion = getNodeSuggestions(node).find(s => s.id === id);
        if (nodeSuggestion) {
            found = true;
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
                    tr.setNodeMarkup(pos, undefined, (nodeSuggestion as SuggestionFormatNodeMeta).oldAttrs);
                } else {
                    tr.setNodeAttribute(pos, "suggestions", withoutNodeSuggestion(node, id));
                }
            }
        }

        if (!node.isInline) return true;
        const from = pos, to = pos + node.nodeSize;

        const insertMark = findSuggestionMark(node.marks, suggestionType, "insert");
        const deleteMark = findSuggestionMark(node.marks, suggestionType, "delete");
        const hasInsert = insertMark?.attrs.id === id;
        const hasDelete = deleteMark?.attrs.id === id;

        if (hasInsert || hasDelete) {
            found = true;
            const removeContent =
                (hasInsert && hasDelete) ||
                (hasInsert && !hasDelete && decision === "reject") ||
                (hasDelete && !hasInsert && decision === "accept");

            if (removeContent) {
                deleteRanges.push({ from, to });
            } else {
                if (hasInsert && insertMark) tr.removeMark(from, to, insertMark);
                if (hasDelete && deleteMark) tr.removeMark(from, to, deleteMark);
            }
        }

        const formatMark = findSuggestionMark(node.marks, suggestionType, "format");
        if (formatMark && formatMark.attrs.id === id) {
            found = true;
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

    if (tr.steps.length > 0 || found) {
        tr.setMeta(SUGGESTIONS_SKIP_META, true);
        tr.setMeta(suggestionsPluginKey, { events: [{ kind: "resolve", id, decision } satisfies SuggestionEvent] });
        focusAdjacentItem(tr, items, id);
        view.dispatch(tr);
        view.focus();
    }
}

export function setNodeAttrs(view: EditorView, pos: number, attrs: Record<string, unknown>): void {
    const { state } = view;
    const node = state.doc.nodeAt(pos);
    if (!node) return;

    const changed = Object.keys(attrs).some(key => attrs[key] !== node.attrs[key]);
    if (!changed) return;

    const pluginState = suggestionsPluginKey.getState(state);
    if (!pluginState || pluginState.mode !== "suggesting" || !state.schema.marks.suggestion) {
        view.dispatch(state.tr.setNodeMarkup(pos, undefined, attrs));
        return;
    }

    const primary = getNodeSuggestions(node).find(s => s.type !== "comment");
    if (primary && primary.type !== "format") {
        // the node itself is still a pending insert/delete - not separately tracked
        view.dispatch(state.tr.setNodeMarkup(pos, undefined, attrs));
        return;
    }

    const tr = state.tr;
    const mine = primary && pluginState.cache[primary.id]?.author === pluginState.author;

    if (primary && mine) {
        tr.setNodeMarkup(pos, undefined, { ...attrs, suggestions: node.attrs.suggestions });
        tr.setMeta(SUGGESTIONS_SKIP_META, true);
    } else {
        const id = generateSuggestionId();
        const oldAttrs = { ...node.attrs, suggestions: null };
        const meta: SuggestionFormatNodeMeta = { type: "format", id, oldAttrs };
        tr.setNodeMarkup(pos, undefined, { ...attrs, suggestions: withNodeSuggestion(node, meta) });
        tr.setMeta(SUGGESTIONS_SKIP_META, true);
        tr.setMeta(suggestionsPluginKey, {
            events: [{ kind: "create", id, type: "format", author: pluginState.author, timestamp: Date.now() } satisfies SuggestionEvent]
        });
    }

    view.dispatch(tr);
}

export function addComment(view: EditorView, text: string): SuggestionItem | null {
    const { state, dispatch } = view;
    const pluginState = suggestionsPluginKey.getState(state);
    if (!pluginState || pluginState.disableCommenting) return null;

    const sel = state.selection;
    if (sel.empty) return null;

    const suggestionType = state.schema.marks.suggestion;
    if (!suggestionType) return null;

    const id = generateSuggestionId();
    const now = Date.now();
    const opening: SuggestionReply = {
        id: generateSuggestionId(),
        author: pluginState.author,
        content: text,
        timestamp: now
    };

    const tr = state.tr;

    if (sel instanceof NodeSelection) {
        const meta: SuggestionNodeMeta = { type: "comment", id };
        tr.setNodeAttribute(sel.from, "suggestions", withNodeSuggestion(sel.node, meta));
    } else {
        tr.addMark(sel.from, sel.to, suggestionType.create({ type: "comment", id }));
    }

    const events: SuggestionEvent[] = [
        { kind: "create", id, type: "comment", author: pluginState.author, timestamp: now },
        { kind: "reply", id, reply: opening }
    ];
    tr.setMeta(SUGGESTIONS_SKIP_META, true);
    tr.setMeta(suggestionsPluginKey, { events });
    dispatch(tr);

    return {
        id, type: "comment", author: pluginState.author, timestamp: now,
        from: sel.from, to: sel.to,
        insertedText: "", deletedText: "", formatAdd: [], formatRemove: [],
        comments: [opening]
    };
}

export function replyToSuggestion(view: EditorView, id: string, text: string): SuggestionReply | null {
    const { state, dispatch } = view;
    const pluginState = suggestionsPluginKey.getState(state);
    if (!pluginState || pluginState.disableCommenting) return null;

    if (!getSuggestions(state).some(item => item.id === id)) return null;

    const reply: SuggestionReply = {
        id: generateSuggestionId(),
        author: pluginState.author,
        content: text,
        timestamp: Date.now()
    };

    dispatch(state.tr.setMeta(suggestionsPluginKey, { events: [{ kind: "reply", id, reply } satisfies SuggestionEvent] }));
    return reply;
}

export function editSuggestionReply(view: EditorView, id: string, replyId: string, content: string): void {
    const { state, dispatch } = view;
    const pluginState = suggestionsPluginKey.getState(state);
    if (!pluginState) return;

    dispatch(state.tr.setMeta(suggestionsPluginKey, {
        events: [{ kind: "editReply", id, replyId, content } satisfies SuggestionEvent]
    }));
}

export function deleteSuggestionReply(view: EditorView, id: string, replyId: string): void {
    const { state, dispatch } = view;
    const pluginState = suggestionsPluginKey.getState(state);
    if (!pluginState) return;

    const item = getSuggestions(state).find(i => i.id === id);
    if (item?.type === "comment" && item.comments.length <= 1) {
        resolveComment(view, id);
        return;
    }

    dispatch(state.tr.setMeta(suggestionsPluginKey, {
        events: [{ kind: "deleteReply", id, replyId } satisfies SuggestionEvent]
    }));
}

export function resolveComment(view: EditorView, id: string): void {
    const { state, dispatch } = view;
    const suggestionType = state.schema.marks.suggestion;
    if (!suggestionType) return;

    const items = getSuggestions(state);
    const tr = state.tr;
    let found = false;

    state.doc.descendants((node, pos) => {
        if (getNodeSuggestions(node).some(s => s.id === id && s.type === "comment")) {
            found = true;
            tr.setNodeAttribute(pos, "suggestions", withoutNodeSuggestion(node, id));
        }

        if (!node.isInline) return true;

        const mark = node.marks.find(m => m.type === suggestionType && m.attrs.type === "comment" && m.attrs.id === id);
        if (mark) {
            found = true;
            tr.removeMark(pos, pos + node.nodeSize, mark);
        }

        return true;
    });

    if (found) {
        tr.setMeta(SUGGESTIONS_SKIP_META, true);
        tr.setMeta(suggestionsPluginKey, { events: [{ kind: "resolve", id, decision: "resolve" } satisfies SuggestionEvent] });
        focusAdjacentItem(tr, items, id);
        dispatch(tr);
        view.focus();
    }
}

export function seedSuggestionSource(
    view: EditorView,
    entries: { id: string; type: SuggestionSubtype; author: Author }[]
): void {
    if (!entries.length) return;
    const now = Date.now();
    const events: SuggestionEvent[] = entries.map(e => ({ kind: "create", ...e, timestamp: now }));
    view.dispatch(view.state.tr.setMeta(suggestionsPluginKey, { events }));
}
