import { Plugin, PluginKey, TextSelection, type Transaction } from "prosemirror-state";
import { AddMarkStep, Mapping, RemoveMarkStep, ReplaceStep } from "prosemirror-transform";
import { Fragment, type Mark, type MarkType, type Node, type Slice } from "prosemirror-model";

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
                const tr = oldState.tr;
                let changed = false;

                // maps positions from oldState.doc space into the "real" (unrewritten)
                // space right before the current original transaction being processed
                let priorMapping = new Mapping();

                for (const origTr of transactions) {
                    if (!origTr.docChanged) continue;

                    for (let i = 0; i < origTr.steps.length; i++) {
                        const step = origTr.steps[i];

                        const combined = new Mapping();
                        combined.appendMapping(origTr.mapping.slice(0, i).invert());
                        combined.appendMapping(priorMapping);
                        combined.appendMapping(tr.mapping);

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

    // if this is a collapsed edit (typing or backspacing) right at the edge of
    // an existing suggestion by this user, extend it instead of starting a new one
    if (to === from && from > 0) {
        const nodeBefore = doc.nodeAt(from - 1);
        if (nodeBefore) {
            const insertMark = insertType.isInSet(nodeBefore.marks);
            if (insertMark && insertMark.attrs.userId === user.id) return insertMark.attrs.id;

            const deleteMark = deleteType.isInSet(nodeBefore.marks);
            if (deleteMark && deleteMark.attrs.userId === user.id) return deleteMark.attrs.id;
        }
    }

    return null;
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

    if (to > from) {
        tr.addMark(from, to, deleteType.create(attrs));
    }

    if (slice.size > 0) {
        const markedContent = addMarkToFragment(slice.content, insertType.create(attrs));
        tr.insert(to, markedContent);
    }

    tr.setSelection(TextSelection.create(tr.doc, to + slice.size));
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
