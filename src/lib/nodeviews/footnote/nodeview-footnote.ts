import type { Node } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { findFootnoteRefPos, jumpToPos } from "../../plugins/footnotes/commands";

export default class FootnoteNodeView implements NodeView {

    private node: Node;
    private view: EditorView;

    public dom: HTMLElement;
    public contentDOM: HTMLElement;

    constructor(node: Node, view: EditorView) {
        this.node = node;
        this.view = view;

        this.dom = document.createElement("div");
        this.dom.className = "footnote-item";
        this.dom.dataset.id = node.attrs.id;

        this.contentDOM = document.createElement("div");
        this.contentDOM.className = "footnote-content";
        this.dom.appendChild(this.contentDOM);

        const back = document.createElement("button");
        back.type = "button";
        back.className = "footnote-back";
        back.contentEditable = "false";
        back.title = "Back to text";
        back.textContent = "↑";
        back.addEventListener("click", (e) => {
            e.preventDefault();
            const refPos = findFootnoteRefPos(this.view.state, this.node.attrs.id);
            if (refPos !== null) {
                jumpToPos(this.view, refPos);
            }
        });
        this.dom.appendChild(back);
    }

    update(node: Node) {
        if (node.type.name !== "footnote") return false;
        this.node = node;
        this.dom.dataset.id = node.attrs.id;
        return true;
    }

}
