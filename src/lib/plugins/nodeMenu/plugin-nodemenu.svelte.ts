import { Plugin, type PluginView } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { mount, unmount } from "svelte";
import NodeMenu from "./NodeMenu.svelte";
import { nodeMenuPos, topLevelBlockPosAt } from "./node-menu";

export default function nodeMenuPlugin() {
    return new Plugin({
        view(editorView) { return new NodeMenuPluginView(editorView) }
    })
}

/**
 * Tracks which top-level block the pointer is currently over (so the drag
 * handle can be shown next to it) and mounts the NodeMenu component, which
 * renders the handle and implements the actual drag-to-reorder behavior.
 *
 * The handle lives outside view.dom (as a fixed-position sibling, so it can
 * sit in the gutter to the left of the editor content), which is why hover
 * tracking is done here with a plain DOM listener on the shared container
 * rather than via ProseMirror's handleDOMEvents - events on the handle
 * itself don't bubble through view.dom.
 */
export class NodeMenuPluginView implements PluginView {
    private view: EditorView;
    private container: HTMLElement;
    private wrap: HTMLElement;
    private component: object;

    constructor(view: EditorView) {
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
            }
        });
    }

    private onMouseMove(event: MouseEvent) {
        if (!this.view.editable) {
            nodeMenuPos.set(null);
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
