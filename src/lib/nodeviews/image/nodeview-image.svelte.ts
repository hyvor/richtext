import type { Node } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import ImageNodeview from "./ImageNodeview.svelte";
import { mount } from "svelte";
import type { EditorConfig } from "$lib/config";

export default class ImageView implements NodeView {

    private node: Node;
    private view: EditorView;
    private getPos: () => number | undefined;

    public dom: HTMLDivElement;

    private props: {
        view: EditorView;
        fileUploader: EditorConfig['fileUploader'];
        fileMaxSizeInMB: EditorConfig['fileMaxSizeInMB'];
        oversizedNoteText: EditorConfig['image']['oversizedNoteText'];
        getPos: () => number | undefined;
        src: string;
        alt: string;
        width: number | null;
        height: number | null;
    } = $state({} as any);


    constructor(
        node: Node,
        view: EditorView,
        getPos: () => number | undefined,
        fileUploader: EditorConfig['fileUploader'],
        fileMaxSizeInMB: EditorConfig['fileMaxSizeInMB'],
        oversizedNoteText: EditorConfig['image']['oversizedNoteText']
    ) {
        this.node = node;
        this.view = view;
        this.getPos = getPos;

        this.dom = document.createElement('div');
        this.dom.className = 'image-wrap';
        this.dom.style.display = 'flex';
        this.dom.style.justifyContent = 'center';

        this.setPropsFromNode(node);

        this.props.view = this.view;
        this.props.getPos = this.getPos;
        this.props.fileUploader = fileUploader;
        this.props.fileMaxSizeInMB = fileMaxSizeInMB;
        this.props.oversizedNoteText = oversizedNoteText;
        this.setPropsFromNode(node);

        mount(ImageNodeview, {
            target: this.dom,
            props: this.props
        });

    }

    private setPropsFromNode(node: Node) {
        this.props.src = node.attrs.src;
        this.props.alt = node.attrs.alt;
        this.props.width = node.attrs.width;
        this.props.height = node.attrs.height;
    }

    update(node: Node) {
        if (node.type.name === 'image') {
            this.setPropsFromNode(node);
            return true;
        }
        return false;
    }


    stopEvent(e: Event) {
        if (e.target instanceof HTMLElement && e.target.closest('.alt-badge, .resize-handle')) {
            return true;
        }
        return false;
    }

} 