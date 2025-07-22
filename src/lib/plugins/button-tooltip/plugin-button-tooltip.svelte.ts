import { EditorState, NodeSelection, Plugin, type PluginView } from "prosemirror-state"
import type { EditorView } from "prosemirror-view";
import  { mount } from "svelte";
import ButtonTooltip from "./ButtonTooltip.svelte";

export default function buttonTooltipPlugin() {
    return new Plugin({
        view(editorView) { return new ButtonTooltipPlugin(editorView) }
    })
}

class ButtonTooltipPlugin implements PluginView {

    view: EditorView;
    wrap: HTMLElement;

    private props: {
        view: EditorView,
        show: boolean,
        updateId: number
    } = $state({} as any);

    constructor(view: EditorView) {
        this.view = view;

        this.wrap = document.createElement("div")
        this.wrap.className = "pm-button-tooltip"
        view.dom!.parentNode!.appendChild(this.wrap);

        this.props = {
            view: this.view,
            show: false,
            updateId: 0
        }

        mount(ButtonTooltip, {
            target: this.wrap,
            props: this.props
        });

    }

    update(view: EditorView, lastState: EditorState): void {

        const state = view.state

        if (
            lastState && 
            lastState.doc.eq(state.doc) &&
            lastState.selection.eq(state.selection)
        ) return

        if (
            !state.selection.empty || 
            !view.editable ||
            state.selection instanceof NodeSelection ||
            state.selection.$from.parent.type.name !== 'button'
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
