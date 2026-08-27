import type { Node } from "prosemirror-model";
import type { NodeView } from "prosemirror-view";
import EmbedNodeview from "./EmbedNodeview.svelte";
import { mount } from "svelte";
import type { EditorConfig } from "$lib/config";

export default class EmbedView implements NodeView {

    dom: HTMLElement;

    private props: {
        url: string;
        fetchEmbed: EditorConfig['embed'];
    } = $state({} as any);

    constructor(node: Node, fetchEmbed: EditorConfig['embed']) {
        this.dom = document.createElement("x-embed");

        this.props.url = node.attrs.url;
        this.props.fetchEmbed = fetchEmbed;

        mount(EmbedNodeview, {
            target: this.dom,
            props: this.props
        });
    }

    update(node: Node) {
        if (node.type.name !== 'embed') return false;
        this.props.url = node.attrs.url;
        return true;
    }

}
