import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "prosemirror-state";
import { AddMarkStep, Mapping, RemoveMarkStep, ReplaceStep } from "prosemirror-transform";
import { Fragment, Slice, type Mark, type MarkType, type Node } from "prosemirror-model";
import { Decoration, DecorationSet } from "prosemirror-view";
import { isHistoryTransaction } from "prosemirror-history";
import { SuggestionsPanelView } from "./plugin-suggestions-panel.svelte";

// {id, userId, userName} recorded on a node's suggestionInsert/suggestionDelete
// attr when the whole node (not just some inline content inside it) is itself
// a pending suggestion - see withSuggestionAttrs in schema.ts.
export interface SuggestionNodeMeta {
    id: string;
    userId: string;
    userName: string;
}

// suggestionFormat additionally carries a snapshot of the node's attrs from
// before the change, so a reject can restore them exactly.
export interface SuggestionFormatNodeMeta extends SuggestionNodeMeta {
    oldAttrs: Record<string, unknown>;
}

export interface SuggestionUser {
    id: string;
    name: string;
}

export type SuggestionMode = "editing" | "suggesting";

export interface SuggestionsPluginState {
    mode: SuggestionMode;
    user: SuggestionUser;
}

export const suggestionsPluginKey = new PluginKey<SuggestionsPluginState>("suggestions");

// set on transactions we generate ourselves, so we don't try to re-process them
const REWRITTEN_META = "suggestionsRewritten";
// set on transactions from accept/reject commands, so they are applied as-is
export const SUGGESTIONS_SKIP_META = "suggestionsSkip";

let idCounter = 0;
export function generateSuggestionId(): string {
    idCounter++;
    return `sg-${Date.now().toString(36)}-${idCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Track-changes ("suggesting") mode for the editor: while active, edits are
 * rewritten into suggestion_insert/suggestion_delete/suggestion_format marks
 * (and, for whole deleted block/atom nodes, a suggestionDelete node attr)
 * instead of being applied directly - see schema.ts. Pair with the commands
 * in ./commands.ts to list/accept/reject the resulting suggestions.
 *
 * This plugin only ever *produces* suggestionDelete on whole nodes (deleting
 * an existing block/atom while suggesting); it never produces suggestionInsert
 * or suggestionFormat on whole nodes - those are only ever produced by
 * src/lib/diff's buildDiffDoc (comparing two documents can propose a whole new
 * node, or one whose attrs changed, in a way live typing never does). This
 * plugin does render decorations for, and its commands do accept/reject,
 * suggestionInsert/suggestionFormat too, so a diff's output is just as
 * interactive as a live-typed suggestion.
 */
export default function suggestionsPlugin(initial: { user: SuggestionUser; mode?: SuggestionMode }) {
    return new Plugin<SuggestionsPluginState>({
        key: suggestionsPluginKey,

        state: {
            init(): SuggestionsPluginState {
                return {
                    mode: initial.mode ?? "editing",
                    user: initial.user
                };
            },
            apply(tr, value): SuggestionsPluginState {
                const meta = tr.getMeta(suggestionsPluginKey);
                if (meta) return { ...value, ...meta };
                return value;
            }
        },

        props: {
            // Collapsed-cursor Backspace/Delete within plain text isn't handled by any
            // ProseMirror command (deleteSelection requires a selection, joinBackward/
            // Forward only apply at block boundaries), so it normally falls through to
            // the browser's native contenteditable edit, which we then have to diff back
            // into a transaction. When the caret sits next to marked (struck-through)
            // suggestion text, that native DOM mutation can span much more than the one
            // character the user meant to delete, corrupting existing suggestion marks.
            // Intercept these two keys ourselves while suggesting and dispatch a precise
            // single-character replace, bypassing the native edit entirely.
            handleKeyDown(view, event) {
                if (event.key !== "Backspace" && event.key !== "Delete") return false;

                const state = view.state;
                const suggestionState = suggestionsPluginKey.getState(state);
                if (!suggestionState || suggestionState.mode !== "suggesting") return false;

                const { selection } = state;
                if (!selection.empty) return false;

                const insertType = state.schema.marks.suggestion_insert;
                const deleteType = state.schema.marks.suggestion_delete;
                if (!insertType || !deleteType) return false;

                const $pos = selection.$from;
                let from: number, to: number;
                if (event.key === "Backspace") {
                    if ($pos.parentOffset === 0) return false;
                    from = $pos.pos - 1;
                    to = $pos.pos;
                } else {
                    if ($pos.parentOffset === $pos.parent.content.size) return false;
                    from = $pos.pos;
                    to = $pos.pos + 1;
                }

                if (!isPlainTextReplace(state.doc, from, to, Slice.empty)) return false;

                const tr = state.tr;
                const id = handleReplaceStep(tr, new ReplaceStep(from, to, Slice.empty), suggestionState.user);
                tr.setMeta(REWRITTEN_META, true);
                // Because this dispatches a single mark-only transaction directly
                // (bypassing the root+appended pair the normal flow produces),
                // prosemirror-history's default adjacency check - which looks at real
                // position-shifting steps - can't tell that consecutive backspaces
                // belong together, and would file each one as its own undo step.
                // Tagging them with the (stable, reused) suggestion id as the
                // "composition" keeps history grouping them into one.
                if (id) tr.setMeta("composition", id);
                view.dispatch(tr);
                return true;
            },

            // Marks only apply to inline content, so a whole deleted/inserted/
            // reformatted block/atom node is tracked via node attrs (see schema.ts)
            // instead of a mark. Render those attrs as visual decorations here
            // rather than baking them into every node type's toDOM, and
            // independent of suggesting/editing mode (like the inline suggestion
            // marks, they stay visible until accepted/rejected).
            decorations(state) {
                const decorations: Decoration[] = [];

                // A whole-node "replace" (see mergeDiffs's 'replace' case in diff/render.ts)
                // is a deleted node immediately followed by its replacement, the two sharing
                // one suggestion id. Collect which ids have both halves up front so those two
                // nodes can be styled as one connected pair below, instead of looking like two
                // unrelated changes that happen to sit next to each other.
                const deleteIds = new Set<string>();
                const insertIds = new Set<string>();
                state.doc.descendants((node) => {
                    const del = node.attrs.suggestionDelete as SuggestionNodeMeta | null | undefined;
                    if (del && del.id) deleteIds.add(del.id);
                    const ins = node.attrs.suggestionInsert as SuggestionNodeMeta | null | undefined;
                    if (ins && ins.id) insertIds.add(ins.id);
                    return true;
                });

                state.doc.descendants((node, pos) => {
                    const del = node.attrs.suggestionDelete as SuggestionNodeMeta | null | undefined;
                    if (del && del.id) {
                        const isReplace = insertIds.has(del.id);
                        decorations.push(Decoration.node(pos, pos + node.nodeSize, {
                            class: isReplace ? "suggestion-node-delete suggestion-node-replace-delete" : "suggestion-node-delete",
                            "data-suggestion-id": del.id,
                            title: del.userName
                                ? `Suggested ${isReplace ? "replacement" : "deletion"} by ${del.userName}`
                                : `Suggested ${isReplace ? "replacement" : "deletion"}`
                        }));
                        if (isReplace) {
                            // sits right at the boundary between the deleted node and its
                            // paired inserted node - a small "replaced" divider connecting them
                            decorations.push(Decoration.widget(pos + node.nodeSize, () => {
                                const el = document.createElement("div");
                                el.className = "suggestion-replace-connector";
                                el.setAttribute("data-suggestion-id", del.id);
                                el.textContent = "Replaced with";
                                return el;
                            }, { key: `replace-${del.id}` }));
                        }
                        return false;
                    }

                    const ins = node.attrs.suggestionInsert as SuggestionNodeMeta | null | undefined;
                    if (ins && ins.id) {
                        const isReplace = deleteIds.has(ins.id);
                        decorations.push(Decoration.node(pos, pos + node.nodeSize, {
                            class: isReplace ? "suggestion-node-insert suggestion-node-replace-insert" : "suggestion-node-insert",
                            "data-suggestion-id": ins.id,
                            title: ins.userName
                                ? `Suggested ${isReplace ? "replacement" : "insertion"} by ${ins.userName}`
                                : `Suggested ${isReplace ? "replacement" : "insertion"}`
                        }));
                        return false;
                    }

                    const fmt = node.attrs.suggestionFormat as SuggestionFormatNodeMeta | null | undefined;
                    if (fmt && fmt.id) {
                        decorations.push(Decoration.node(pos, pos + node.nodeSize, {
                            class: "suggestion-node-format",
                            "data-suggestion-id": fmt.id,
                            title: fmt.userName ? `Suggested formatting by ${fmt.userName}` : "Suggested formatting"
                        }));
                    }

                    return true;
                });
                return decorations.length ? DecorationSet.create(state.doc, decorations) : null;
            }
        },

        appendTransaction(transactions, oldState, newState) {

            const suggestionState = suggestionsPluginKey.getState(oldState);
            if (!suggestionState || suggestionState.mode !== "suggesting") return null;

            if (transactions.some(tr =>
                tr.getMeta(REWRITTEN_META) || tr.getMeta(SUGGESTIONS_SKIP_META) || isHistoryTransaction(tr)
            )) {
                // undo/redo transactions are already the exact inverse of a previous,
                // already-rewritten transaction (or a plain edit from before suggestion
                // marks existed) - reprocessing them here would wrap that inverse in
                // suggestion marks too, so let them apply untouched
                return null;
            }

            if (!transactions.some(tr => tr.docChanged)) return null;

            const schema = oldState.schema;
            if (!schema.marks.suggestion_insert || !schema.marks.suggestion_delete) {
                // suggestion marks not available in this schema
                return null;
            }

            try {
                // Fast path for the common case: a single plain-text insertion (i.e.
                // ordinary typing). The typed content is already sitting correctly in
                // newState.doc, so just mark it in place - no need for the undo+replay
                // round trip below. This isn't just an optimization: undoing then
                // reinserting at the same position produces a transaction whose mapping
                // "crosses" (its reported start ends up after its end), which
                // prosemirror-history's adjacency check silently can't use, so it would
                // otherwise file every keystroke as its own undo step instead of
                // grouping consecutive typing into one.
                const fast = tryFastPureInsert(transactions, newState, suggestionState.user);
                if (fast) return fast;

                // appendTransaction must return a transaction starting from newState.doc,
                // so we build it from newState.tr, first undo the original edits in exact
                // reverse order (restoring oldState.doc), then replay them with suggestion
                // marks applied on top of that restored content.
                const tr = newState.tr;

                for (let ti = transactions.length - 1; ti >= 0; ti--) {
                    const origTr = transactions[ti];
                    if (!origTr.docChanged) continue;
                    for (let si = origTr.steps.length - 1; si >= 0; si--) {
                        const invertedStep = origTr.steps[si].invert(origTr.docs[si]);
                        tr.step(invertedStep);
                    }
                }

                // tr.doc now matches oldState.doc; remember where the undo maps end so we
                // can build a mapping that only spans the replay steps added below
                const replayCheckpoint = tr.mapping.maps.length;

                let changed = false;

                // maps positions from oldState.doc space into the "real" (unrewritten)
                // space right before the current original transaction being processed
                let priorMapping = new Mapping();

                for (const origTr of transactions) {
                    if (!origTr.docChanged) continue;

                    for (let i = 0; i < origTr.steps.length; i++) {
                        const step = origTr.steps[i];

                        const combined = new Mapping();
                        combined.appendMapping(subMapping(origTr.mapping, 0, i).invert());
                        combined.appendMapping(priorMapping.invert());
                        combined.appendMapping(subMapping(tr.mapping, replayCheckpoint, tr.mapping.maps.length));

                        const mapped = step.map(combined);
                        if (!mapped) continue;

                        if (mapped instanceof ReplaceStep) {
                            handleReplaceStep(tr, mapped, suggestionState.user);
                        } else if (mapped instanceof AddMarkStep) {
                            handleAddMarkStep(tr, mapped, suggestionState.user);
                        } else if (mapped instanceof RemoveMarkStep) {
                            handleRemoveMarkStep(tr, mapped, suggestionState.user);
                        } else {
                            tr.step(mapped);
                        }
                        changed = true;
                    }

                    priorMapping.appendMapping(origTr.mapping);
                }

                if (!changed) return null;

                tr.setMeta(REWRITTEN_META, true);
                return tr;
            } catch (e) {
                console.error("suggestions plugin: failed to rewrite transaction, applying edit as-is", e);
                return null;
            }
        },

        // floating accept/dismiss panel - shown whenever there's at least one
        // pending suggestion, so reviewing suggestions is part of the editor
        // itself rather than something every app has to build (see
        // ./plugin-suggestions-panel.svelte.ts and ./SuggestionsPanel.svelte)
        view(editorView) {
            return new SuggestionsPanelView(editorView);
        }

    });
}

// Handles a lone plain-text insertion (from === to, one step, one transaction) by
// marking the already-inserted text in place instead of going through the general
// undo+replay path. Returns null for anything else, so the caller falls back.
function tryFastPureInsert(
    transactions: readonly Transaction[],
    newState: EditorState,
    user: SuggestionUser
): Transaction | null {
    const changed = transactions.filter(tr => tr.docChanged);
    if (changed.length !== 1 || changed[0].steps.length !== 1) return null;

    const step = changed[0].steps[0];
    if (!(step instanceof ReplaceStep)) return null;
    if (step.from !== step.to || step.slice.size === 0) return null;
    if (step.slice.openStart > 0 || step.slice.openEnd > 0) return null;

    let onlyText = true;
    step.slice.content.forEach(node => { if (!node.isText) onlyText = false; });
    if (!onlyText) return null;

    const from = step.from;
    const to = from + step.slice.size;
    if (!isPlainTextReplace(newState.doc, from, to, step.slice)) return null;

    const schema = newState.schema;
    const insertType = schema.marks.suggestion_insert!;
    const deleteType = schema.marks.suggestion_delete!;

    const id = findReuseId(newState.doc, from, to, user, insertType, deleteType) ?? generateSuggestionId();
    const attrs = { id, userId: user.id, userName: user.name };

    const tr = newState.tr;
    tr.addMark(from, to, insertType.create(attrs));
    tr.setSelection(TextSelection.create(tr.doc, to));
    tr.setMeta(REWRITTEN_META, true);
    return tr;
}

// Mapping.slice() only restricts .map()/.mapResult(); .invert() and .appendMapping()
// ignore the slice bounds and operate on the full underlying maps array. Build a real
// (independently-backed) sub-mapping when the result needs to be inverted or composed.
function subMapping(mapping: Mapping, from: number, to: number): Mapping {
    return new Mapping(mapping.maps.slice(from, to));
}

function isPlainTextReplace(doc: Node, from: number, to: number, slice: Slice): boolean {
    if (slice.openStart > 0 || slice.openEnd > 0) return false;

    const $from = doc.resolve(from);
    const $to = doc.resolve(to);
    if ($from.parent !== $to.parent) return false;
    if (!$from.parent.inlineContent) return false;

    let onlyInline = true;
    slice.content.forEach(node => {
        if (!node.isInline) onlyInline = false;
    });

    return onlyInline;
}

function addMarkToFragment(fragment: Fragment, mark: Mark): Fragment {
    const children: Node[] = [];
    fragment.forEach(node => {
        if (node.isInline) {
            children.push(node.mark(mark.addToSet(node.marks)));
        } else {
            children.push(node.copy(addMarkToFragment(node.content, mark)));
        }
    });
    return Fragment.fromArray(children);
}

function findReuseId(
    doc: Node,
    from: number,
    to: number,
    user: SuggestionUser,
    insertType: MarkType,
    deleteType: MarkType
): string | null {

    // if the range being replaced already carries an unresolved insertion by
    // this user, reuse its id (e.g. typing then immediately backspacing)
    let foundInRange: string | null = null;
    if (to > from) {
        doc.nodesBetween(from, to, node => {
            if (foundInRange || !node.isInline) return true;
            const m = insertType.isInSet(node.marks);
            if (m && m.attrs.userId === user.id) foundInRange = m.attrs.id;
            return true;
        });
    }
    if (foundInRange) return foundInRange;

    // if this edit is adjacent to an existing unresolved suggestion by this user
    // (typing right after your own pending insert, or backspacing into text you
    // already marked as deleted), extend it instead of starting a new one
    const ownMarkId = (node: Node | null): string | null => {
        if (!node) return null;
        const insertMark = insertType.isInSet(node.marks);
        if (insertMark && insertMark.attrs.userId === user.id) return insertMark.attrs.id;
        const deleteMark = deleteType.isInSet(node.marks);
        if (deleteMark && deleteMark.attrs.userId === user.id) return deleteMark.attrs.id;
        return null;
    };

    if (from > 0) {
        const id = ownMarkId(doc.nodeAt(from - 1));
        if (id) return id;
    }

    if (to < doc.content.size) {
        const id = ownMarkId(doc.nodeAt(to));
        if (id) return id;
    }

    return null;
}

interface DeletionSegment {
    from: number;
    to: number;
    // true if this segment is this user's own unresolved insertion - deleting it
    // should cancel the insertion outright rather than mark it as deleted
    cancel: boolean;
}

function computeDeletionSegments(
    doc: Node,
    from: number,
    to: number,
    user: SuggestionUser,
    insertType: MarkType
): DeletionSegment[] {
    const segments: DeletionSegment[] = [];
    doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isInline) return true;
        const segFrom = Math.max(pos, from);
        const segTo = Math.min(pos + node.nodeSize, to);
        if (segTo <= segFrom) return true;

        const mark = insertType.isInSet(node.marks);
        const cancel = !!mark && mark.attrs.userId === user.id;

        const last = segments[segments.length - 1];
        if (last && last.cancel === cancel && last.to === segFrom) {
            last.to = segTo;
        } else {
            segments.push({ from: segFrom, to: segTo, cancel });
        }
        return true;
    });
    return segments;
}

// Finds a contiguous run of complete sibling nodes exactly spanning [from, to)
// under a common parent (no partial/split node at either edge). Returns null if
// the range doesn't line up with whole-node boundaries, or includes text nodes
// (plain text deletion is handled separately via marks).
function findWholeNodeRange(doc: Node, from: number, to: number): { node: Node; pos: number }[] | null {
    if (to <= from) return null;

    const $from = doc.resolve(from);
    const $to = doc.resolve(to);
    if ($from.parent !== $to.parent) return null;

    const parent = $from.parent;
    const result: { node: Node; pos: number }[] = [];
    let pos = $from.start();
    let collecting = false;

    for (let i = 0; i < parent.childCount; i++) {
        const child = parent.child(i);
        const childStart = pos;
        const childEnd = pos + child.nodeSize;

        if (!collecting && childStart === from) collecting = true;

        if (collecting) {
            if (child.isText || childStart < from || childEnd > to) return null;
            result.push({ node: child, pos: childStart });
            if (childEnd === to) return result;
        }

        pos = childEnd;
    }

    return null;
}

// Marks whole nodes as pending-delete suggestions via their `suggestionDelete`
// attr instead of removing them, so they can later be accepted (removed) or
// rejected (attr cleared). Nodes already marked deleted are left untouched.
function markNodesDeleted(tr: Transaction, nodes: { node: Node; pos: number }[], user: SuggestionUser): string | null {
    const toMark = nodes.filter(({ node }) => !node.attrs.suggestionDelete);
    if (!toMark.length) {
        // everything in range is already marked deleted; surface that shared id
        return (nodes[0]?.node.attrs.suggestionDelete as SuggestionNodeMeta | undefined)?.id ?? null;
    }

    const attrs: SuggestionNodeMeta = { id: generateSuggestionId(), userId: user.id, userName: user.name };
    for (const { pos } of toMark) {
        tr.setNodeAttribute(pos, "suggestionDelete", attrs);
    }
    return attrs.id;
}

// Detects a slice made up entirely of complete block-level (non-text,
// non-inline) nodes with no split ends - the mirror image of
// findWholeNodeRange, but for content being *inserted* rather than removed.
// A structural split (e.g. the slice ProseMirror builds for pressing Enter)
// has open ends, so it never matches this; only a slice that's cleanly a
// list of whole nodes - a fresh node created via the node menu's drag handle
// or the slash menu - does.
function wholeBlockNodesInSlice(slice: Slice): Node[] | null {
    if (slice.openStart > 0 || slice.openEnd > 0) return null;
    if (slice.content.childCount === 0) return null;

    const nodes: Node[] = [];
    let allBlock = true;
    slice.content.forEach(node => {
        if (node.isText || node.isInline) allBlock = false;
        nodes.push(node);
    });
    return allBlock ? nodes : null;
}

// Inserts whole node(s) and marks them as pending-insert suggestions via
// their `suggestionInsert` attr - the insertion counterpart of
// markNodesDeleted. `reuseId`, when given, pairs this insertion with an
// existing deletion (the 'replace' case in handleReplaceStep) so the two
// render as one connected suggestion instead of two unrelated ones.
function markNodesInserted(
    tr: Transaction,
    from: number,
    nodes: readonly Node[],
    user: SuggestionUser,
    reuseId?: string
): string {
    const attrs: SuggestionNodeMeta = { id: reuseId ?? generateSuggestionId(), userId: user.id, userName: user.name };
    let pos = from;
    for (const node of nodes) {
        tr.insert(pos, node);
        tr.setNodeAttribute(pos, "suggestionInsert", attrs);
        pos += node.nodeSize;
    }
    return attrs.id;
}

// Returns the suggestion id involved (for callers that need it, e.g. to group
// consecutive edits in the undo history), or null if this step didn't result
// in a tracked suggestion change (structural passthrough, no-op, etc).
function handleReplaceStep(tr: Transaction, step: ReplaceStep, user: SuggestionUser): string | null {
    const { from, to, slice } = step;
    const schema = tr.doc.type.schema;
    const insertType = schema.marks.suggestion_insert!;
    const deleteType = schema.marks.suggestion_delete!;

    if (from === to && slice.size === 0) return null;

    if (slice.size === 0) {
        const wholeNodes = findWholeNodeRange(tr.doc, from, to);
        if (wholeNodes) {
            return markNodesDeleted(tr, wholeNodes, user);
        }
    } else {
        const insertedNodes = wholeBlockNodesInSlice(slice);
        if (insertedNodes) {
            if (from === to) {
                // pure whole-node insertion, nothing replaced - e.g. a node
                // dropped here via the node menu's drag handle
                return markNodesInserted(tr, from, insertedNodes, user);
            }

            const wholeNodes = findWholeNodeRange(tr.doc, from, to);
            if (wholeNodes) {
                // whole node(s) replaced by (a) different whole node(s) -
                // e.g. turning the paragraph "/image" was typed into into an
                // actual image via the slash menu (Slash.svelte's handleClick
                // replaces the whole node in one step). Keep the old node(s)
                // in place (marked deleted, same as a plain whole-node
                // delete) and insert the new one right after, pairing them
                // with a shared id so they render as one connected "replaced
                // with" suggestion (see the decorations prop above and
                // diff/render.ts's 'replace' case, which produces the same
                // shape from a document diff).
                const deleteId = markNodesDeleted(tr, wholeNodes, user);
                if (deleteId) {
                    const last = wholeNodes[wholeNodes.length - 1]!;
                    return markNodesInserted(tr, last.pos + last.node.nodeSize, insertedNodes, user, deleteId);
                }
            }
        }
    }

    if (!isPlainTextReplace(tr.doc, from, to, slice)) {
        // structural change (node add/remove, block split/join, etc.) -
        // out of scope for suggestion tracking, apply directly
        tr.step(step);
        return null;
    }

    const id = findReuseId(tr.doc, from, to, user, insertType, deleteType) ?? generateSuggestionId();
    const attrs = { id, userId: user.id, userName: user.name };

    let insertAt = to;

    if (to > from) {
        // deleting your own not-yet-resolved insertion should just remove it (cancel
        // the suggestion) rather than mark it as deleted on top of an insert mark;
        // only content that isn't your own pending insertion gets a delete mark
        const mapStart = tr.mapping.maps.length;
        const segments = computeDeletionSegments(tr.doc, from, to, user, insertType);
        for (let i = segments.length - 1; i >= 0; i--) {
            const seg = segments[i];
            if (seg.cancel) {
                tr.delete(seg.from, seg.to);
            } else {
                tr.addMark(seg.from, seg.to, deleteType.create(attrs));
            }
        }
        insertAt = subMapping(tr.mapping, mapStart, tr.mapping.maps.length).map(to, -1);
    }

    if (slice.size > 0) {
        const markedContent = addMarkToFragment(slice.content, insertType.create(attrs));
        tr.insert(insertAt, markedContent);
        tr.setSelection(TextSelection.create(tr.doc, insertAt + slice.size));
    } else {
        // nothing was inserted: place the cursor before the (possibly still-present,
        // delete-marked) range rather than after it, so repeated backspaces keep
        // walking left instead of re-targeting the same already-marked text
        tr.setSelection(TextSelection.create(tr.doc, from));
    }

    return id;
}

function handleAddMarkStep(tr: Transaction, step: AddMarkStep, user: SuggestionUser) {
    tr.step(step);

    const formatType = tr.doc.type.schema.marks.suggestion_format;
    if (!formatType) return;

    tagFormatChange(tr, step.from, step.to, user, formatType, { addType: step.mark.type.name });
}

function handleRemoveMarkStep(tr: Transaction, step: RemoveMarkStep, user: SuggestionUser) {
    tr.step(step);

    const formatType = tr.doc.type.schema.marks.suggestion_format;
    if (!formatType) return;

    tagFormatChange(tr, step.from, step.to, user, formatType, {
        removeType: step.mark.type.name,
        removeAttrs: step.mark.attrs
    });
}

function tagFormatChange(
    tr: Transaction,
    from: number,
    to: number,
    user: SuggestionUser,
    formatType: MarkType,
    change: { addType?: string; removeType?: string; removeAttrs?: Record<string, any> }
) {
    if (from >= to) return;

    let existing: Mark | undefined;
    tr.doc.nodesBetween(from, to, node => {
        if (existing || !node.isInline) return true;
        const m = formatType.isInSet(node.marks);
        if (m && m.attrs.userId === user.id) existing = m;
        return true;
    });

    const id = existing?.attrs.id ?? generateSuggestionId();
    const add: string[] = existing ? [...existing.attrs.add] : [];
    const remove: { type: string; attrs: Record<string, any> }[] = existing ? [...existing.attrs.remove] : [];

    if (change.addType) {
        const idx = remove.findIndex(r => r.type === change.addType);
        if (idx >= 0) remove.splice(idx, 1);
        else if (!add.includes(change.addType)) add.push(change.addType);
    }

    if (change.removeType) {
        const idx = add.indexOf(change.removeType);
        if (idx >= 0) add.splice(idx, 1);
        else remove.push({ type: change.removeType, attrs: change.removeAttrs ?? {} });
    }

    if (add.length === 0 && remove.length === 0) {
        tr.removeMark(from, to, formatType);
        return;
    }

    const mark = formatType.create({ id, userId: user.id, userName: user.name, add, remove });
    tr.addMark(from, to, mark);
}
