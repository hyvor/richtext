import { Node as PMNode } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";

export const footnotesPluginKey = new PluginKey("footnotes");

let idCounter = 0;
export function generateFootnoteId(): string {
    idCounter++;
    return `fn-${Date.now().toString(36)}-${idCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

// ids of footnote_ref nodes, in document order, first occurrence only.
// does not descend into `footnotes` itself, so a stray ref pasted into a
// footnote body is never treated as a real reference.
function collectRefIds(doc: PMNode): string[] {
    const ids: string[] = [];
    doc.descendants((node) => {
        if (node.type.name === "footnotes") return false;
        if (node.type.name === "footnote_ref" && node.attrs.id && !ids.includes(node.attrs.id)) {
            ids.push(node.attrs.id);
        }
        return true;
    });
    return ids;
}

function findFootnotesContainer(doc: PMNode): { pos: number; node: PMNode } | null {
    let found: { pos: number; node: PMNode } | null = null;
    doc.forEach((node, pos) => {
        if (node.type.name === "footnotes") found = { pos, node };
    });
    return found;
}

// keeps the `footnotes` container's children in sync with the footnote_ref
// markers found in the rest of the document: creates the container and any
// missing items, drops orphaned items, and reorders items to match each
// ref's first-appearance order (numbering in the UI is done purely with CSS
// counters, so this order is what makes ref numbers line up with item numbers).
export default function footnotesPlugin() {
    return new Plugin({
        key: footnotesPluginKey,
        appendTransaction(transactions, _oldState, newState) {

            if (!transactions.some((tr) => tr.docChanged)) return null;

            const schema = newState.schema;
            const footnoteType = schema.nodes.footnote;
            const footnotesType = schema.nodes.footnotes;
            const refType = schema.nodes.footnote_ref;
            if (!footnoteType || !footnotesType || !refType) return null;

            const refIds = collectRefIds(newState.doc);
            const container = findFootnotesContainer(newState.doc);

            const existingItems: { id: string; node: PMNode }[] = [];
            if (container) {
                container.node.forEach((child) => {
                    if (child.type.name === "footnote") {
                        existingItems.push({ id: child.attrs.id, node: child });
                    }
                });
            }
            const existingIds = existingItems.map((i) => i.id);

            const inSync =
                existingIds.length === refIds.length &&
                existingIds.every((id, i) => id === refIds[i]);

            if (inSync) return null;

            if (refIds.length === 0) {
                if (!container) return null;
                return newState.tr
                    .delete(container.pos, container.pos + container.node.nodeSize)
                    .setMeta("addToHistory", false);
            }

            const itemsById = new Map(existingItems.map((i) => [i.id, i.node]));
            const newItems = refIds.map((id) => itemsById.get(id) ?? footnoteType.create({ id }));
            const newContainer = footnotesType.create({}, newItems);

            const tr = newState.tr;
            if (container) {
                tr.replaceWith(container.pos, container.pos + container.node.nodeSize, newContainer);
            } else {
                tr.insert(newState.doc.content.size, newContainer);
            }
            return tr.setMeta("addToHistory", false);
        }
    });
}
