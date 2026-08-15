import type { EditorState, PluginView } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { mount, unmount } from "svelte";
import CommentsPanel from "./CommentsPanel.svelte";
import { commentsPluginKey } from "./plugin-comments";

// Mounted as the comments plugin's PluginView (see plugin-comments.ts), so
// any editor with that plugin attached automatically gets a floating panel
// listing/replying-to/resolving comment threads whenever there's at least
// one - mirrors SuggestionsPanelView in ../suggestions exactly.
export class CommentsPanelView implements PluginView {

    view: EditorView;
    private wrap: HTMLElement;
    private panel: Record<string, any> | null = null;

    private props: {
        view: EditorView;
        updateId: number;
    } = $state({} as any);

    constructor(view: EditorView) {
        this.view = view;

        this.wrap = document.createElement("div");
        this.wrap.className = "pm-comments-panel-wrap";
        view.dom!.parentNode!.appendChild(this.wrap);

        this.props = {
            view: this.view,
            updateId: 0
        };

        this.panel = mount(CommentsPanel, {
            target: this.wrap,
            props: this.props
        });
    }

    update(view: EditorView, lastState: EditorState) {
        const state = view.state;
        // re-render on doc changes (a thread's anchor moving/disappearing),
        // selection-only changes (re-focus the nearest thread as the cursor
        // moves), and comment-cache-only changes (a reply/resolve/refresh
        // that doesn't touch the doc, e.g. one dispatched from the panel
        // itself while the selection stays put)
        if (
            lastState &&
            lastState.doc.eq(state.doc) &&
            lastState.selection.eq(state.selection) &&
            commentsPluginKey.getState(lastState) === commentsPluginKey.getState(state)
        ) return;
        this.props.updateId++;
    }

    destroy() {
        this.panel && unmount(this.panel);
        this.wrap.remove();
    }

}
