import type { EditorState } from "prosemirror-state";
import { NodeSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { commentsPluginKey, generateCommentId, type Comment, type CommentUser } from "./plugin-comments";

// A commented range's position in the document - content lives in
// getComments(), this is purely "where is thread X anchored right now".
export interface CommentThread {
    commentId: string;
    from: number;
    to: number;
}

/**
 * Every commented range currently in the document, derived fresh from the
 * `comment` mark and `commentIds` node attr (see schema.ts) - the doc is the
 * only source of truth for which threads are still active and where. Same
 * ids appearing in more than one spot (e.g. a thread whose range crosses an
 * inline mark boundary) are merged into one [from, to) span.
 */
export function getCommentThreads(state: EditorState): CommentThread[] {
    const commentMark = state.schema.marks.comment;
    const threads = new Map<string, CommentThread>();

    function extend(commentId: string, from: number, to: number) {
        const existing = threads.get(commentId);
        if (existing) {
            existing.from = Math.min(existing.from, from);
            existing.to = Math.max(existing.to, to);
        } else {
            threads.set(commentId, { commentId, from, to });
        }
    }

    state.doc.descendants((node, pos) => {
        if (commentMark) {
            for (const mark of node.marks) {
                if (mark.type === commentMark && mark.attrs.commentId) {
                    extend(mark.attrs.commentId, pos, pos + node.nodeSize);
                }
            }
        }

        const commentIds = node.attrs.commentIds as string[] | null | undefined;
        if (commentIds) {
            for (const commentId of commentIds) extend(commentId, pos, pos + node.nodeSize);
        }

        return true;
    });

    return Array.from(threads.values()).sort((a, b) => a.from - b.from);
}

// The plugin's local cache of comment content (seeded from
// CommentsPluginConfig.getComments(), kept up to date optimistically by
// addComment/replyToComment/resolveComment below) - grouped with
// getCommentThreads()'s anchors, this is enough to render a full thread.
export function getComments(state: EditorState): Comment[] {
    return commentsPluginKey.getState(state)?.comments ?? [];
}

export function getCommentUser(state: EditorState): CommentUser {
    return commentsPluginKey.getState(state)?.user ?? { id: "", name: "" };
}

/**
 * Re-invokes CommentsPluginConfig.getComments() and replaces the plugin's
 * local cache with the result - lets the host push in changes made outside
 * this editor (another collaborator replying, resolving, ...).
 */
export function refreshComments(view: EditorView) {
    const pluginState = commentsPluginKey.getState(view.state);
    if (!pluginState) return;
    Promise.resolve(pluginState.config.getComments()).then((comments) => {
        if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(commentsPluginKey, { comments }));
    });
}

/**
 * Attaches a new comment thread to the current selection (a text range, or
 * a whole selected node like an image). Returns the new thread's opening
 * Comment, or null if there's nothing selected / the schema has no comment
 * mark. Applies the doc change and updates the local comment cache
 * immediately, then notifies the host via onAdd so it can persist it.
 */
export function addComment(view: EditorView, text: string): Comment | null {
    const { state, dispatch } = view;
    const pluginState = commentsPluginKey.getState(state);
    if (!pluginState) return null;

    const sel = state.selection;
    if (sel.empty) return null;

    const commentMark = state.schema.marks.comment;
    if (!commentMark) return null;

    const commentId = generateCommentId();
    const tr = state.tr;

    if (sel instanceof NodeSelection) {
        const existing = (sel.node.attrs.commentIds as string[] | null) ?? [];
        tr.setNodeAttribute(sel.from, "commentIds", [...existing, commentId]);
    } else {
        tr.addMark(sel.from, sel.to, commentMark.create({ commentId }));
    }

    const comment: Comment = {
        id: commentId,
        commentId,
        user: pluginState.user,
        text,
        createdAt: Date.now()
    };

    tr.setMeta(commentsPluginKey, { comments: [...pluginState.comments, comment] });
    dispatch(tr);

    Promise.resolve(pluginState.config.onAdd(comment));

    return comment;
}

/**
 * Adds a reply to an existing thread. Replies don't touch the document -
 * the thread's doc anchor (and its highlight) already exists from the
 * opening comment.
 */
export function replyToComment(view: EditorView, commentId: string, text: string): Comment | null {
    const pluginState = commentsPluginKey.getState(view.state);
    if (!pluginState) return null;

    const reply: Comment = {
        id: generateCommentId(),
        commentId,
        user: pluginState.user,
        text,
        createdAt: Date.now()
    };

    view.dispatch(view.state.tr.setMeta(commentsPluginKey, { comments: [...pluginState.comments, reply] }));
    Promise.resolve(pluginState.config.onReply(reply));

    return reply;
}

/**
 * Resolves a thread: strips its mark/node-attr entries from the document
 * (removing just that thread's highlight, leaving any other overlapping
 * threads intact) and drops its comments (opening + replies) from the local
 * cache, then notifies the host via onResolve.
 */
export function resolveComment(view: EditorView, commentId: string): void {
    const { state, dispatch } = view;
    const pluginState = commentsPluginKey.getState(state);
    if (!pluginState) return;

    const commentMark = state.schema.marks.comment;
    const tr = state.tr;

    state.doc.descendants((node, pos) => {
        if (commentMark) {
            const mark = node.marks.find((m) => m.type === commentMark && m.attrs.commentId === commentId);
            if (mark) tr.removeMark(pos, pos + node.nodeSize, mark);
        }

        const commentIds = node.attrs.commentIds as string[] | null | undefined;
        if (commentIds?.includes(commentId)) {
            const remaining = commentIds.filter((id) => id !== commentId);
            tr.setNodeAttribute(pos, "commentIds", remaining.length ? remaining : null);
        }

        return true;
    });

    tr.setMeta(commentsPluginKey, {
        comments: pluginState.comments.filter((c) => c.commentId !== commentId)
    });

    dispatch(tr);

    Promise.resolve(pluginState.config.onResolve(commentId));
}
