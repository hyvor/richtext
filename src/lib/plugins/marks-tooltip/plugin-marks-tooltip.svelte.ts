import { EditorState, NodeSelection, Plugin, type PluginView } from "prosemirror-state"
import type { EditorView } from "prosemirror-view";
import MarksTooltip from "./MarksTooltip.svelte";
import { suggestionsPluginKey } from "../suggestions/plugin-suggestions";
import  { mount } from "svelte";


export default function marksTooltipPlugin() {
    return new Plugin({
        view(editorView) { return new MarksTooltipPlugin(editorView) }
    })
}

class MarksTooltipPlugin implements PluginView {

    view: EditorView;
    wrap: HTMLElement;

    private lastEditable: boolean;

    private props: {
        view: EditorView,
        show: boolean,
        updateId: number
    } = $state({} as any);

    constructor(view: EditorView) {
        this.view = view;
        this.lastEditable = view.editable;

        this.wrap = document.createElement("div")
        this.wrap.className = "pm-tooltip"
        view.dom!.parentNode!.appendChild(this.wrap);

        this.props = {
            view: this.view,
            show: false,
            updateId: 0
        }

        mount(MarksTooltip, {
            target: this.wrap,
            props: this.props
        });

    }

    update(view: EditorView, lastState: EditorState): void {

        const state = view.state

        const lastDisableCommenting = lastState && suggestionsPluginKey.getState(lastState)?.disableCommenting;
        const newDisableCommenting = suggestionsPluginKey.getState(state)?.disableCommenting;

        const editableChanged = view.editable !== this.lastEditable;
        this.lastEditable = view.editable;

        if (
            !editableChanged &&
            lastState &&
            lastState.doc.eq(state.doc) &&
            lastState.selection.eq(state.selection) &&
            lastDisableCommenting === newDisableCommenting
        ) return

        if (
            state.selection.empty || 
            !view.editable ||
            state.doc.cut(state.selection.from, state.selection.to).textContent === "" ||
            state.selection instanceof NodeSelection ||
            Boolean(state.selection.$from.parent.type.spec.code || state.selection.$to.parent.type.spec.code)
        ) {
            this.props.show = false;
            return
        }

        this.props.show = true;
        this.props.updateId++;

    }

    destroy() {
        this.wrap.remove()
    }

}