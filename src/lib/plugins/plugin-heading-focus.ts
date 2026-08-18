import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

// add a .heading-focused class to the heading node when it is focused
export default function headingFocusPlugin() {
    return new Plugin({
        props: {
            decorations(state) {
                const { $from } = state.selection;
                for (let d = $from.depth; d >= 0; d--) {
                    const node = $from.node(d);
                    if (node.type.name === "heading") {
                        const pos = $from.before(d);
                        return DecorationSet.create(state.doc, [
                            Decoration.node(pos, pos + node.nodeSize, { class: "heading-focused" })
                        ]);
                    }
                }
                return null;
            }
        }
    });
}
