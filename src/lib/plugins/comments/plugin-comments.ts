import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { CommentsPanelView } from "./plugin-comments-panel.svelte";

export interface CommentUser {
    id: string;
    name: string;
}

// A comment or a reply - same shape, as the document itself never
// distinguishes the two. `commentId` identifies the thread: for a thread's
// opening comment, commentId === id (self-referencing); a reply carries the
// same commentId as the thread it belongs to, but its own distinct id. This
// lets a flat list from the host's store be grouped into threads by
// commentId alone, with no separate parent/child structure to maintain.
export interface Comment {
    id: string;
    commentId: string;
    user: CommentUser;
    text: string;
    createdAt: number;
}

// The editor never persists comment content itself - only the thread id,
// via the `comment` mark / `commentIds` node attr (see schema.ts). Actual
// comment text/author/replies live in whatever store the host app already
// has for them, reached through these callbacks - the same shape as
// `fileUploader` in EditorConfig, but for a bigger, stateful feature (like
// suggestionsPlugin) so it's a plugin config object instead of an
// EditorConfig field.
export interface CommentsPluginConfig {
    user: CommentUser;
    // (re)loads the full flat list of comments+replies from the host's
    // store - called once when the plugin is created, and again whenever
    // refreshComments() is invoked (e.g. after the host learns of a change
    // made elsewhere, such as another collaborator replying).
    getComments: () => Comment[] | Promise<Comment[]>;
    // fired after the user starts/replies to/resolves a thread from inside
    // this editor, so the host can persist it into its own store. The doc
    // change (and the plugin's own local list) is applied optimistically
    // before these are called - they're notifications, not gates.
    onAdd: (comment: Comment) => void | Promise<void>;
    onReply: (reply: Comment) => void | Promise<void>;
    onResolve: (commentId: string) => void | Promise<void>;
}

export interface CommentsPluginState {
    user: CommentUser;
    comments: Comment[];
    config: CommentsPluginConfig;
}

export const commentsPluginKey = new PluginKey<CommentsPluginState>("comments");

let idCounter = 0;
export function generateCommentId(): string {
    idCounter++;
    return `cm-${Date.now().toString(36)}-${idCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Lets a user select a piece of content (text or a whole node) and attach a
 * comment thread to it. The editor only ever stores the thread's id in the
 * document (see the `comment` mark and `commentIds` node attr in
 * schema.ts) - comment text, authorship and replies are owned entirely by
 * the host app, reached through the callbacks in `CommentsPluginConfig`.
 * Pair with the commands in ./commands.ts to create/list/reply/resolve
 * threads, and see ./CommentsPanel.svelte for the floating review UI this
 * plugin mounts automatically.
 */
export default function commentsPlugin(config: CommentsPluginConfig) {
    return new Plugin<CommentsPluginState>({
        key: commentsPluginKey,

        state: {
            init(): CommentsPluginState {
                return { user: config.user, comments: [], config };
            },
            apply(tr, value): CommentsPluginState {
                const meta = tr.getMeta(commentsPluginKey);
                if (meta) return { ...value, ...meta };
                return value;
            }
        },

        props: {
            // Unlike the `comment` mark (which renders its own highlight via
            // toDOM/CommentMarkView), the `commentIds` node attr has no DOM
            // representation of its own - a whole commented node (an image,
            // a table, ...) needs a decoration here to be visually flagged
            // at all, the same way suggestionInsert/Delete/Format do in
            // plugin-suggestions.ts.
            decorations(state) {
                const decorations: Decoration[] = [];
                state.doc.descendants((node, pos) => {
                    const commentIds = node.attrs.commentIds as string[] | null | undefined;
                    if (commentIds && commentIds.length > 0) {
                        decorations.push(Decoration.node(pos, pos + node.nodeSize, {
                            class: "node-comment",
                            "data-comment-id": commentIds[0]
                        }));
                    }
                    return true;
                });
                return decorations.length ? DecorationSet.create(state.doc, decorations) : null;
            }
        },

        view(editorView) {
            Promise.resolve(config.getComments()).then((comments) => {
                if (editorView.isDestroyed) return;
                editorView.dispatch(editorView.state.tr.setMeta(commentsPluginKey, { comments }));
            });
            return new CommentsPanelView(editorView);
        }
    });
}
