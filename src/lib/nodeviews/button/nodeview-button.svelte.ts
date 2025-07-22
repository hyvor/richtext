import type { Node } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { mount } from "svelte";

export default class ButtonNodeView implements NodeView {

    private node: Node;
    private view: EditorView;
    private getPos: () => number | undefined;

    public dom: HTMLDivElement;
    public contentDOM: HTMLAnchorElement;

    private buttonAroundProps: {
        getPos: () => number | undefined;
        view: EditorView;
        href: string;
        showTooltip?: boolean;
    } = $state({} as any)

    constructor(node: Node, view: EditorView, getPos: () => number | undefined) {

        this.node = node;
        this.view = view;
        this.getPos = getPos;

        this.dom = document.createElement('div');
        this.dom.className = 'button-wrap';

        this.contentDOM = document.createElement('a');
        this.contentDOM.className = 'button';

        this.dom.appendChild(this.contentDOM);

        this.buttonAroundProps = {
            getPos: this.getPos,
            view: this.view,
            href: node.attrs.href,
            showTooltip: false
        }

    }

    update(node: Node): boolean {
        if (node.type.name !== 'button') {
			return false;
		}

        if (node.attrs.href !== this.node.attrs.href) {
            this.contentDOM.setAttribute('href', node.attrs.href || '#');
            this.buttonAroundProps.href = node.attrs.href
        }

        this.node = node;
        
        return true;
    }

}
