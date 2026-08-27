import type { Node } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { findFootnoteItemPos, jumpToPos } from "../../plugins/footnotes/commands";

export default class FootnoteRefNodeView implements NodeView {

    private node: Node;
    private view: EditorView;

    public dom: HTMLElement;

    constructor(node: Node, view: EditorView) {
        this.node = node;
        this.view = view;

        this.dom = document.createElement("sup");
        this.dom.className = "footnote-ref";
        this.dom.dataset.id = node.attrs.id;
        this.dom.title = "Go to footnote";

        this.dom.addEventListener("click", () => {
            const itemPos = findFootnoteItemPos(this.view.state, this.node.attrs.id);
            if (itemPos !== null) {
                jumpToPos(this.view, itemPos);
            }
        });
    }

    stopEvent(event: Event) {
        return event.type === "mousedown";
    }

    update(node: Node) {
        if (node.type.name !== "footnote_ref") return false;
        this.node = node;
        this.dom.dataset.id = node.attrs.id;
        return true;
    }

}
