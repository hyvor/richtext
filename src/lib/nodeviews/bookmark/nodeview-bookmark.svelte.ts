import type { Node } from "prosemirror-model";
import type { NodeView } from "prosemirror-view";
import BookmarkNodeview from "./BookmarkNodeview.svelte";
import { mount } from "svelte";
import type { EditorConfig } from "$lib/config";

export default class BookmarkView implements NodeView {

    dom: HTMLElement;

    private props: {
        url: string;
        fetchBookmark: EditorConfig['bookmark'];
    } = $state({} as any);

    constructor(node: Node, fetchBookmark: EditorConfig['bookmark']) {
        this.dom = document.createElement("bookmark");

        this.props.url = node.attrs.url;
        this.props.fetchBookmark = fetchBookmark;

        mount(BookmarkNodeview, {
            target: this.dom,
            props: this.props
        });
    }

    update(node: Node) {
        if (node.type.name !== 'bookmark') return false;
        this.props.url = node.attrs.url;
        return true;
    }

}
