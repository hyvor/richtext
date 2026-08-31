import type { EditorState, PluginView } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { mount, unmount } from "svelte";
import SuggestionsPanel from "./SuggestionsPanel.svelte";
import { suggestionsPluginKey } from "./plugin-suggestions";

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
        const editableChanged = view.editable !== this.lastEditable;
        this.lastEditable = view.editable;

        const lastPluginState = lastState && suggestionsPluginKey.getState(lastState);
        const newPluginState = suggestionsPluginKey.getState(view.state);
        if (
            !editableChanged &&
            lastState &&
            lastState.doc.eq(view.state.doc) &&
            lastState.selection.eq(view.state.selection) &&
            lastPluginState?.cache === newPluginState?.cache &&
            lastPluginState?.disableCommenting === newPluginState?.disableCommenting
        ) return;
        this.props.updateId++;
    }

    destroy() {
        this.panel && unmount(this.panel);
        this.wrap.remove();
    }

}
