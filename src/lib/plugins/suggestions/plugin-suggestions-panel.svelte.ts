import type { EditorState, PluginView } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { mount, unmount } from "svelte";
import SuggestionsPanel from "./SuggestionsPanel.svelte";
import { suggestionsPluginKey } from "./plugin-suggestions";

// Mounted as the suggestions plugin's PluginView (see plugin-suggestions.ts),
// so any editor with that plugin attached automatically gets a floating
// accept/dismiss panel whenever there's at least one pending suggestion -
// review is part of the editor itself, not something each app has to build.
export class SuggestionsPanelView implements PluginView {

    view: EditorView;
    private wrap: HTMLElement;
    private panel: Record<string, any> | null = null;
    private lastEditable: boolean;

    private props: {
        view: EditorView;
        updateId: number;
    } = $state({} as any);

    constructor(view: EditorView) {
        this.view = view;
        this.lastEditable = view.editable;

        this.wrap = document.createElement("div");
        this.wrap.className = "pm-suggestions-panel-wrap";
        view.dom!.parentNode!.appendChild(this.wrap);

        this.props = {
            view: this.view,
            updateId: 0
        };

        this.panel = mount(SuggestionsPanel, {
            target: this.wrap,
            props: this.props
        });
    }

    update(view: EditorView, lastState: EditorState) {
        // re-render on doc changes (suggestions list), selection-only changes
        // (moving the cursor around should re-focus the nearest suggestion in
        // the panel, even without editing anything), cache-only changes
        // (a reply or a newly-resolved author/comments from the host's
        // SuggestionSource - see plugin-suggestions.ts - touches neither doc
        // nor selection, only plugin state), and editable changes (setEditable
        // doesn't touch state at all, see SuggestionsPanel.svelte's
        // view.editable check - so this is the only signal for that one)
        const editableChanged = view.editable !== this.lastEditable;
        this.lastEditable = view.editable;

        const lastCache = lastState && suggestionsPluginKey.getState(lastState)?.cache;
        const newCache = suggestionsPluginKey.getState(view.state)?.cache;
        if (
            !editableChanged &&
            lastState &&
            lastState.doc.eq(view.state.doc) &&
            lastState.selection.eq(view.state.selection) &&
            lastCache === newCache
        ) return;
        this.props.updateId++;
    }

    destroy() {
        this.panel && unmount(this.panel);
        this.wrap.remove();
    }

}
