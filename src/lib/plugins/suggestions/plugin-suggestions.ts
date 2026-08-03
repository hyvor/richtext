import { Plugin, PluginKey, TextSelection, type Transaction } from "prosemirror-state";
import { AddMarkStep, Mapping, RemoveMarkStep, ReplaceStep } from "prosemirror-transform";
import { Fragment, Slice, type Mark, type MarkType, type Node } from "prosemirror-model";

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
                handleReplaceStep(tr, new ReplaceStep(from, to, Slice.empty), suggestionState.user);
                tr.setMeta(REWRITTEN_META, true);
                view.dispatch(tr);
                return true;
            }
        },

        appendTransaction(transactions, oldState, newState) {

            const suggestionState = suggestionsPluginKey.getState(oldState);
            if (!suggestionState || suggestionState.mode !== "suggesting") return null;

            if (transactions.some(tr => tr.getMeta(REWRITTEN_META) || tr.getMeta(SUGGESTIONS_SKIP_META))) {
                return null;
            }

            if (!transactions.some(tr => tr.docChanged)) return null;

            const schema = oldState.schema;
            if (!schema.marks.suggestion_insert || !schema.marks.suggestion_delete) {
                // suggestion marks not available in this schema (feature disabled)
                return null;
            }

            try {
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
        }

    });
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

function handleReplaceStep(tr: Transaction, step: ReplaceStep, user: SuggestionUser) {
    const { from, to, slice } = step;
    const schema = tr.doc.type.schema;
    const insertType = schema.marks.suggestion_insert!;
    const deleteType = schema.marks.suggestion_delete!;

    if (from === to && slice.size === 0) return;

    if (!isPlainTextReplace(tr.doc, from, to, slice)) {
        // structural change (node add/remove, block split/join, etc.) -
        // out of scope for suggestion tracking, apply directly
        tr.step(step);
        return;
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
