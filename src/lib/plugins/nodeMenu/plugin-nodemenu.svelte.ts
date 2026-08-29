import { Plugin, type PluginView } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { mount, unmount } from "svelte";
import NodeMenu from "./NodeMenu.svelte";
import { nodeMenuPos, topLevelBlockPosAt } from "./node-menu";
import type { EditorConfig } from "$lib/config";

export default function nodeMenuPlugin(config: EditorConfig) {
    return new Plugin({
        view(editorView) { return new NodeMenuPluginView(editorView, config) }
    })
}

export class NodeMenuPluginView implements PluginView {
    private view: EditorView;
    private container: HTMLElement;
    private wrap: HTMLElement;
    private component: object;

    constructor(view: EditorView, config: EditorConfig) {
        this.view = view;
        this.container = view.dom.parentNode as HTMLElement;

        this.wrap = document.createElement("div");
        this.container.appendChild(this.wrap);

        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseLeave = this.onMouseLeave.bind(this);
        this.container.addEventListener("mousemove", this.onMouseMove);
        this.container.addEventListener("mouseleave", this.onMouseLeave);

        this.component = mount(NodeMenu, {
            target: this.wrap,
            props: {
                view: this.view,
                fileUploader: config.fileUploader,
                fileMaxSizeInMB: config.fileMaxSizeInMB,
            }
        });
    }

    private onMouseMove(event: MouseEvent) {
        if (!this.view.editable) {
            nodeMenuPos.set(null);
            return;
        }

        // ignore when the pointer is over the menu's own handle/dropdown
        if (event.target instanceof Node && this.wrap.contains(event.target)) {
            return;
        }

        const result = this.view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (!result) {
            nodeMenuPos.set(null);
            return;
        }

        const resolvedPos = this.view.state.doc.resolve(result.pos);
        nodeMenuPos.set(topLevelBlockPosAt(resolvedPos));
    }

    private onMouseLeave() {
        nodeMenuPos.set(null);
    }

    destroy() {
        this.container.removeEventListener("mousemove", this.onMouseMove);
        this.container.removeEventListener("mouseleave", this.onMouseLeave);
        unmount(this.component);
        this.wrap.remove();
    }
}
