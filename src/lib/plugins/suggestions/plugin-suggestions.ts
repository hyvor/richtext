import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "prosemirror-state";
import { AddMarkStep, Mapping, RemoveMarkStep, ReplaceStep } from "prosemirror-transform";
import { Fragment, Slice, type Mark, type MarkType, type Node } from "prosemirror-model";
import { Decoration, DecorationSet } from "prosemirror-view";
import { isHistoryTransaction } from "prosemirror-history";
import { SuggestionsPanelView } from "./panel.svelte";
import { SuggestionsSourceView } from "./source";

// author can be any host-given string
// for HB, we have user:<id> and ai
export type Author = string;

// What a host app's resolveAuthor callback (see SuggestionsPluginState) turns
// an Author into for display in the panel.
export interface AuthorInfo {
    name: string;
    picture?: string;
}

// A reply in an annotation's discussion thread - attached to any suggestion
// (insert/delete/format) or comment via the plugin's `source`-backed cache
// (see SuggestionSource below), keyed by the mark/node-attr's `id`. This is
// what makes suggestions repliable: there's no separate "comment on a
// suggestion" concept, just this array, sourced from outside the document.
export interface SuggestionReply {
    id: string;
    author: Author;
    content: string;
    timestamp: number;
}

export type SuggestionSubtype = "insert" | "delete" | "format" | "comment";

// {type, id} recorded in a node's `suggestions` attr (a list - see
// withSuggestionAttrs in schema.ts) when the whole node (not just some inline
// content inside it) itself carries a pending suggestion or comment thread.
// Mirrors the `suggestion` mark's attrs for the same four subtypes, just on a
// node instead of a mark instance. No author/comments here either - see
// SuggestionSource.
export interface SuggestionNodeMeta {
    type: SuggestionSubtype;
    id: string;
}

// type: "format" additionally carries a snapshot of the node's attrs from
// before the change, so a reject can restore them exactly.
export interface SuggestionFormatNodeMeta extends SuggestionNodeMeta {
    type: "format";
    oldAttrs: Record<string, unknown>;
}

// The suggestion mark type covers all four subtypes (see marks.suggestion in
// schema.ts) - MarkType.isInSet alone can't tell them apart, since it only
// matches by mark type, not attrs. Use this instead of `.isInSet`.
export function findSuggestionMark(
    marks: readonly Mark[],
    suggestionType: MarkType,
    subtype: SuggestionSubtype
): Mark | undefined {
    return marks.find(m => m.type === suggestionType && m.attrs.type === subtype);
}

// returns suggestions in a node
// note: only one non-comment suggestion, but multiple comments can be present
export function getNodeSuggestions(node: Node): SuggestionNodeMeta[] {
    return (node.attrs.suggestions as SuggestionNodeMeta[] | null) ?? [];
}

export function findNodeSuggestion(node: Node, subtype: SuggestionSubtype): SuggestionNodeMeta | undefined {
    return getNodeSuggestions(node).find(s => s.type === subtype);
}

export function withNodeSuggestion(node: Node, meta: SuggestionNodeMeta): SuggestionNodeMeta[] {
    const existing = getNodeSuggestions(node);
    if (meta.type === "comment") return [...existing, meta];
    return [...existing.filter(s => s.type === "comment"), meta];
}

// Returns null (not []) when the result would be empty, matching the
// schema's `default: null` for `suggestions` - no leftover empty-array attr.
export function withoutNodeSuggestion(node: Node, id: string): SuggestionNodeMeta[] | null {
    const remaining = getNodeSuggestions(node).filter(s => s.id !== id);
    return remaining.length ? remaining : null;
}

// Walks the whole doc collecting every suggestion/comment id present (mark
// instances and node-attr entries alike) - used by the source view to know
// which ids need their author/comments fetched. Deliberately not built on
// commands.ts's richer getSuggestions (which also needs plugin state) to
// avoid an import cycle between this file and commands.ts.
export function collectSuggestionIds(doc: Node, suggestionType: MarkType): Set<string> {
    const ids = new Set<string>();
    doc.descendants(node => {
        for (const s of getNodeSuggestions(node)) ids.add(s.id);
        for (const mark of node.marks) {
            if (mark.type === suggestionType) ids.add(mark.attrs.id);
        }
        return true;
    });
    return ids;
}

export type SuggestionMode = "editing" | "suggesting";

// {author, comments} for a given suggestion/comment id, as returned by the
// host's SuggestionSource - never stored in the document itself (see
// marks.suggestion in schema.ts).
export interface SuggestionSourceEntry {
    author: Author;
    // when the suggestion/comment thread was created - mirrors each
    // SuggestionReply's own `timestamp`, so the panel can show a date for a
    // thread's opening entry the same way it does for replies.
    timestamp: number;
    comments: SuggestionReply[];
}

// Host-supplied backing store for suggestion/comment identity+content data -
// mirrors EditorConfig's uploadFileConfig: the editor only ever holds a
// reference (the mark/node-attr `id`), the host owns the real persistence
// and any auth/attribution checks. `get` is called in batches (never one id
// at a time) whenever the editor encounters ids it hasn't seen yet (e.g.
// right after loading a document). `create`/`reply`/`resolve` are
// fire-and-forget notifications the editor calls once per event, always
// after the causing transaction has already committed locally - never from
// inside appendTransaction. Errors/rejections from any of these are logged,
// never allowed to crash the editor.
export interface SuggestionSource {
    get: (ids: string[]) => Promise<Record<string, SuggestionSourceEntry | null>>;
    create: (id: string, type: SuggestionSubtype, author: Author, timestamp: number) => void;
    reply: (id: string, reply: SuggestionReply) => void;
    resolve?: (id: string, decision: "accept" | "reject" | "resolve") => void;
    editReply?: (id: string, replyId: string, content: string) => void;
    deleteReply?: (id: string, replyId: string) => void;
}

// Describes a suggestion/comment mutation that just happened, attached to the
// causing transaction via `tr.setMeta(suggestionsPluginKey, { events })`.
// The plugin's apply() folds these into `cache` synchronously (so the same
// render already reflects locally-known data), and the source view (see
// plugin-suggestions-source.ts) turns them into SuggestionSource calls
// post-commit. "loaded" is the one kind never sent back to the host - it's
// how a resolved source.get() batch reports back in.
export type SuggestionEvent =
    | { kind: "create"; id: string; type: SuggestionSubtype; author: Author; timestamp: number }
    | { kind: "reply"; id: string; reply: SuggestionReply }
    | { kind: "editReply"; id: string; replyId: string; content: string }
    | { kind: "deleteReply"; id: string; replyId: string }
    | { kind: "resolve"; id: string; decision: "accept" | "reject" | "resolve" }
    | { kind: "loaded"; entries: Record<string, SuggestionSourceEntry | null> };

export interface SuggestionsPluginState {
    mode: SuggestionMode;
    author: Author;
    resolveAuthor: (author: Author) => AuthorInfo | Promise<AuthorInfo>;
    source: SuggestionSource;
    // when true, the host disallows creating new comments and replying to
    // any suggestion/comment thread 
    // existing threads/suggestions are still
    // shown and can still be accepted/rejected/resolved.
    disableCommenting: boolean;
    // key absent = never asked the host; null = asked, host has no record
    // (never retried); otherwise the resolved {author, comments}.
    cache: Record<string, SuggestionSourceEntry | null | undefined>;
    // events folded into `cache` by the transaction just applied - read by
    // the source view once, then naturally superseded by the next apply().
    pendingEvents: SuggestionEvent[];
}

export interface SuggestionsPluginConfig {
    author: Author;
    // 'editing' | 'suggesting' - only gates whether *edits* get auto-wrapped
    // into insert/delete/format suggestions (default 'editing'). Comment
    // authoring via addComment is available regardless of mode, same as
    // today's MarksTooltip/NodeMenu "Comment" actions.
    mode?: SuggestionMode;
    // Turns an Author id into a name/picture for display - see AuthorInfo.
    resolveAuthor: (author: Author) => AuthorInfo | Promise<AuthorInfo>;
    // Backs every suggestion/comment's author + reply thread - see
    // SuggestionSource. Required, same as resolveAuthor: without it the
    // plugin has nowhere to store or read identity/content data at all.
    source: SuggestionSource;
    // when true, hides the "Comment" action (NodeMenu/MarksTooltip) and the
    // suggestions panel's reply input, and rejects addComment/replyToSuggestion
    // - the panel and its existing threads otherwise still work as normal.
    // Default false.
    disableCommenting?: boolean;
}

export const suggestionsPluginKey = new PluginKey<SuggestionsPluginState>("suggestions");

// set on transactions we generate ourselves, so we don't try to re-process them
const REWRITTEN_META = "suggestionsRewritten";
// set on transactions from accept/reject/resolve/reply commands, so they are applied as-is
export const SUGGESTIONS_SKIP_META = "suggestionsSkip";

let idCounter = 0;
export function generateSuggestionId(): string {
    idCounter++;
    return `sg-${Date.now().toString(36)}-${idCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

// Tracks, for a single appendTransaction/handleKeyDown pass, which ids are
// "mine" - backed by the plugin's persisted cache, plus an overlay for ids
// created earlier in this same pass (which haven't gone through apply() yet,
// so they aren't in `cache` at the time this runs). This replaces the old
// `mark.attrs.author === author` comparisons, which relied on a document
// field that no longer exists (and, before this change, was forgeable).
interface OwnershipCheck {
    noteCreated(id: string): void;
    isMine(id: string): boolean;
}

function makeOwnershipCheck(cache: SuggestionsPluginState["cache"], author: Author): OwnershipCheck {
    const local = new Map<string, Author>();
    return {
        noteCreated(id: string) {
            local.set(id, author);
        },
        isMine(id: string): boolean {
            const l = local.get(id);
            if (l) return l === author;
            const cached = cache[id];
            // a cache miss (doc just loaded, source.get hasn't resolved yet)
            // conservatively reads as "not mine" - typing adjacent to your
            // own not-yet-warm pending suggestion starts a new one instead of
            // extending it, until the fetch lands. Rare, self-correcting.
            return !!cached && cached.author === author;
        }
    };
}

/**
 * Provides suggestions & comments features.
 * 
 * ## Suggestion Mode
 * When suggestion mode is on (config.mode === 'suggestion' for initial or later suggestions.setMode()),
 * all edits are rewritten into suggestion marks (insert/delete/format type).
 * 
 * For nodes, suggestion mode is applied via suggestions attribute added to the node.
 * Supported by all nodes except doc and text.
 * 
 * The document only saves a suggestion ID. It's the host app's responsibility to
 * save suggestions & replies in a persistent store.
 * 
 * This plugin only produces "delete" type for nodes. insert or format for whole nodes
 * are only provided by the diff lib.
 * 
 * ## Comments
 * Comments are built on top of suggestions.
 * They can be created using the node menu or the marks tooltip.
 */
export default function suggestionsPlugin(config: SuggestionsPluginConfig) {
    return new Plugin<SuggestionsPluginState>({
        key: suggestionsPluginKey,

        state: {
            init(): SuggestionsPluginState {
                return {
                    mode: config.mode ?? "editing",
                    author: config.author,
                    resolveAuthor: config.resolveAuthor,
                    source: config.source,
                    disableCommenting: config.disableCommenting ?? false,
                    cache: {},
                    pendingEvents: []
                };
            },
            apply(tr, value): SuggestionsPluginState {
                const meta = tr.getMeta(suggestionsPluginKey);
                if (!meta) return value.pendingEvents.length ? { ...value, pendingEvents: [] } : value;

                const next: SuggestionsPluginState = { ...value, ...meta };

                const events = meta.events as SuggestionEvent[] | undefined;
                if (events?.length) {
                    const cache = { ...value.cache };
                    for (const ev of events) {
                        if (ev.kind === "create") {
                            if (!cache[ev.id]) cache[ev.id] = { author: ev.author, timestamp: ev.timestamp, comments: [] };
                        } else if (ev.kind === "reply") {
                            const existing = cache[ev.id] ?? { author: ev.reply.author, timestamp: ev.reply.timestamp, comments: [] };
                            cache[ev.id] = { ...existing, comments: [...existing.comments, ev.reply] };
                        } else if (ev.kind === "editReply") {
                            const existing = cache[ev.id];
                            if (existing) {
                                cache[ev.id] = {
                                    ...existing,
                                    comments: existing.comments.map(c => c.id === ev.replyId ? { ...c, content: ev.content } : c)
                                };
                            }
                        } else if (ev.kind === "deleteReply") {
                            const existing = cache[ev.id];
                            if (existing) {
                                cache[ev.id] = { ...existing, comments: existing.comments.filter(c => c.id !== ev.replyId) };
                            }
                        } else if (ev.kind === "resolve") {
                            delete cache[ev.id];
                        } else if (ev.kind === "loaded") {
                            Object.assign(cache, ev.entries);
                        }
                    }
                    next.cache = cache;
                    next.pendingEvents = events;
                } else {
                    next.pendingEvents = [];
                }

                return next;
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

                if (!state.schema.marks.suggestion) return false;

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
                const events: SuggestionEvent[] = [];
                const ownership = makeOwnershipCheck(suggestionState.cache, suggestionState.author);
                const id = handleReplaceStep(tr, new ReplaceStep(from, to, Slice.empty), suggestionState.author, ownership, events);
                tr.setMeta(REWRITTEN_META, true);
                if (events.length) tr.setMeta(suggestionsPluginKey, { events });
                // allow history plugin to group consecutive backspaces/deletes into one undo step
                if (id) tr.setMeta("composition", id);
                view.dispatch(tr);
                return true;
            },

            // apply decorations to nodes that have suggestions attribute
            // we try to group delete+insert into a 'replace' using the suggestion id when possible.
            decorations(state) {
                const decorations: Decoration[] = [];

                const deleteIds = new Set<string>();
                const insertIds = new Set<string>();
                state.doc.descendants((node) => {
                    for (const s of getNodeSuggestions(node)) {
                        if (s.type === "delete") deleteIds.add(s.id);
                        else if (s.type === "insert") insertIds.add(s.id);
                    }
                    return true;
                });

                state.doc.descendants((node, pos) => {
                    const list = getNodeSuggestions(node);
                    if (!list.length) return true;

                    // a node holds at most one pending insert/delete/format at a time
                    // (the "primary" entry), but any number of independent comment
                    // threads alongside it
                    const primary = list.find(s => s.type !== "comment");
                    const comments = list.filter(s => s.type === "comment");

                    if (primary?.type === "delete") {
                        const isReplace = insertIds.has(primary.id);
                        decorations.push(Decoration.node(pos, pos + node.nodeSize, {
                            class: isReplace ? "suggestion-node-delete suggestion-node-replace-delete" : "suggestion-node-delete",
                            "data-suggestion-id": primary.id,
                            title: `Suggested ${isReplace ? "replacement" : "deletion"}`
                        }));
                        if (isReplace) {
                            // sits right at the boundary between the deleted node and its
                            // paired inserted node - a small "replaced" divider connecting them
                            decorations.push(Decoration.widget(pos + node.nodeSize, () => {
                                const el = document.createElement("div");
                                el.className = "suggestion-replace-connector";
                                el.setAttribute("data-suggestion-id", primary.id);
                                el.textContent = "Replaced with";
                                return el;
                            }, { key: `replace-${primary.id}` }));
                        }
                    } else if (primary?.type === "insert") {
                        const isReplace = deleteIds.has(primary.id);
                        decorations.push(Decoration.node(pos, pos + node.nodeSize, {
                            class: isReplace ? "suggestion-node-insert suggestion-node-replace-insert" : "suggestion-node-insert",
                            "data-suggestion-id": primary.id,
                            title: `Suggested ${isReplace ? "replacement" : "insertion"}`
                        }));
                    } else if (primary?.type === "format") {
                        decorations.push(Decoration.node(pos, pos + node.nodeSize, {
                            class: "suggestion-node-format",
                            "data-suggestion-id": primary.id,
                            title: "Suggested formatting"
                        }));
                    }

                    if (comments.length) {
                        decorations.push(Decoration.node(pos, pos + node.nodeSize, {
                            class: "node-comment",
                            "data-suggestion-ids": comments.map(c => c.id).join(",")
                        }));
                    }

                    // skip descending into children only when this node itself is a
                    // whole insert/delete (matches prior behavior) - format-only or
                    // comment-only nodes still get walked, since their children may
                    // carry their own, independent suggestions/comments
                    return !(primary && primary.type !== "format");
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
                // skip:
                // - our own rewritten transactions (REWRITTEN_META)
                // - skipped manually (SUGGESTIONS_SKIP_META)
                // - history transactions (undo/redo) - already the inverse of a previous transaction, so don't rewrap in suggestion marks
                return null;
            }

            if (!transactions.some(tr => tr.docChanged)) return null;

            const schema = oldState.schema;
            if (!schema.marks.suggestion) {
                console.warn("suggestions plugin: schema has no suggestion mark, but plugin is active - ignoring edits");
                return null;
            }

            const events: SuggestionEvent[] = [];
            const ownership = makeOwnershipCheck(suggestionState.cache, suggestionState.author);

            try {
                // inserting one character is the most common case
                // this handles it fast without additional undo+replay round trip
                const fast = tryFastPureInsert(transactions, newState, suggestionState.author, ownership, events);
                if (fast) {
                    if (events.length) fast.setMeta(suggestionsPluginKey, { events });
                    return fast;
                }

                // for other cases, we undo the original transactions and
                // replay them with suggestion marks applied on top of the restored content
                // note: tr has to start with newState
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
                            handleReplaceStep(tr, mapped, suggestionState.author, ownership, events);
                        } else if (mapped instanceof AddMarkStep) {
                            handleAddMarkStep(tr, mapped, suggestionState.author, ownership, events);
                        } else if (mapped instanceof RemoveMarkStep) {
                            handleRemoveMarkStep(tr, mapped, suggestionState.author, ownership, events);
                        } else {
                            tr.step(mapped);
                        }
                        changed = true;
                    }

                    priorMapping.appendMapping(origTr.mapping);
                }

                if (!changed) return null;

                tr.setMeta(REWRITTEN_META, true);
                if (events.length) tr.setMeta(suggestionsPluginKey, { events });
                return tr;
            } catch (e) {
                console.error("suggestions plugin: failed to rewrite transaction, applying edit as-is", e);
                return null;
            }
        },

        // show panel and wire up source view for host communication
        view(editorView) {
            const panel = new SuggestionsPanelView(editorView);
            const source = new SuggestionsSourceView(editorView);
            return {
                update(view, prevState) {
                    source.update(view, prevState);
                    panel.update(view, prevState);
                },
                destroy() {
                    source.destroy();
                    panel.destroy();
                }
            };
        }

    });
}

// Handles a lone plain-text insertion (from === to, one step, one transaction) by
// marking the already-inserted text in place instead of going through the general
// undo+replay path. Returns null for anything else, so the caller falls back.
function tryFastPureInsert(
    transactions: readonly Transaction[],
    newState: EditorState,
    author: Author,
    ownership: OwnershipCheck,
    events: SuggestionEvent[]
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
    const suggestionType = schema.marks.suggestion!;

    const reuseId = findReuseId(newState.doc, from, to, suggestionType, ownership);
    const id = reuseId ?? generateSuggestionId();
    if (!reuseId) {
        ownership.noteCreated(id);
        events.push({ kind: "create", id, type: "insert", author, timestamp: Date.now() });
    }

    const tr = newState.tr;
    tr.addMark(from, to, suggestionType.create({ type: "insert", id }));
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
    suggestionType: MarkType,
    ownership: OwnershipCheck
): string | null {

    // if the range being replaced already carries an unresolved insertion by
    // this author, reuse its id (e.g. typing then immediately backspacing)
    let foundInRange: string | null = null;
    if (to > from) {
        doc.nodesBetween(from, to, node => {
            if (foundInRange || !node.isInline) return true;
            const m = findSuggestionMark(node.marks, suggestionType, "insert");
            if (m && ownership.isMine(m.attrs.id)) foundInRange = m.attrs.id;
            return true;
        });
    }
    if (foundInRange) return foundInRange;

    // if this edit is adjacent to an existing unresolved suggestion by this author
    // (typing right after your own pending insert, or backspacing into text you
    // already marked as deleted), extend it instead of starting a new one
    const ownMarkId = (node: Node | null): string | null => {
        if (!node) return null;
        const insertMark = findSuggestionMark(node.marks, suggestionType, "insert");
        if (insertMark && ownership.isMine(insertMark.attrs.id)) return insertMark.attrs.id;
        const deleteMark = findSuggestionMark(node.marks, suggestionType, "delete");
        if (deleteMark && ownership.isMine(deleteMark.attrs.id)) return deleteMark.attrs.id;
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
    // true if this segment is this author's own unresolved insertion - deleting it
    // should cancel the insertion outright rather than mark it as deleted
    cancel: boolean;
}

function computeDeletionSegments(
    doc: Node,
    from: number,
    to: number,
    suggestionType: MarkType,
    ownership: OwnershipCheck
): DeletionSegment[] {
    const segments: DeletionSegment[] = [];
    doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isInline) return true;
        const segFrom = Math.max(pos, from);
        const segTo = Math.min(pos + node.nodeSize, to);
        if (segTo <= segFrom) return true;

        const mark = findSuggestionMark(node.marks, suggestionType, "insert");
        const cancel = !!mark && ownership.isMine(mark.attrs.id);

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

// Marks whole nodes as pending-delete suggestions via their `suggestions`
// attr instead of removing them, so they can later be accepted (removed) or
// rejected (entry cleared). Nodes already marked deleted are left untouched.
function markNodesDeleted(
    tr: Transaction,
    nodes: { node: Node; pos: number }[],
    author: Author,
    ownership: OwnershipCheck,
    events: SuggestionEvent[]
): string | null {
    const toMark = nodes.filter(({ node }) => !findNodeSuggestion(node, "delete"));
    if (!toMark.length) {
        // everything in range is already marked deleted; surface that shared id
        return nodes[0] ? findNodeSuggestion(nodes[0].node, "delete")?.id ?? null : null;
    }

    const id = generateSuggestionId();
    const meta: SuggestionNodeMeta = { type: "delete", id };
    for (const { pos, node } of toMark) {
        tr.setNodeAttribute(pos, "suggestions", withNodeSuggestion(node, meta));
    }
    ownership.noteCreated(id);
    events.push({ kind: "create", id, type: "delete", author, timestamp: Date.now() });
    return id;
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
// their `suggestions` attr - the insertion counterpart of markNodesDeleted.
// `reuseId`, when given, pairs this insertion with an existing deletion (the
// 'replace' case in handleReplaceStep) so the two render as one connected
// suggestion instead of two unrelated ones - in that case no new "create"
// event is emitted, since the pairing shares the deletion's.
function markNodesInserted(
    tr: Transaction,
    from: number,
    nodes: readonly Node[],
    author: Author,
    ownership: OwnershipCheck,
    events: SuggestionEvent[],
    reuseId?: string
): string {
    const id = reuseId ?? generateSuggestionId();
    const meta: SuggestionNodeMeta = { type: "insert", id };
    let pos = from;
    for (const node of nodes) {
        tr.insert(pos, node);
        // freshly inserted nodes never already carry a `suggestions` attr
        tr.setNodeAttribute(pos, "suggestions", [meta]);
        pos += node.nodeSize;
    }
    if (!reuseId) {
        ownership.noteCreated(id);
        events.push({ kind: "create", id, type: "insert", author, timestamp: Date.now() });
    }
    return id;
}

// Returns the suggestion id involved (for callers that need it, e.g. to group
// consecutive edits in the undo history), or null if this step didn't result
// in a tracked suggestion change (structural passthrough, no-op, etc).
function handleReplaceStep(
    tr: Transaction,
    step: ReplaceStep,
    author: Author,
    ownership: OwnershipCheck,
    events: SuggestionEvent[]
): string | null {
    const { from, to, slice } = step;
    const schema = tr.doc.type.schema;
    const suggestionType = schema.marks.suggestion!;

    if (from === to && slice.size === 0) return null;

    if (slice.size === 0) {
        const wholeNodes = findWholeNodeRange(tr.doc, from, to);
        if (wholeNodes) {
            return markNodesDeleted(tr, wholeNodes, author, ownership, events);
        }
    } else {
        const insertedNodes = wholeBlockNodesInSlice(slice);
        if (insertedNodes) {
            if (from === to) {
                // pure whole-node insertion, nothing replaced - e.g. a node
                // dropped here via the node menu's drag handle
                return markNodesInserted(tr, from, insertedNodes, author, ownership, events);
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
                const deleteId = markNodesDeleted(tr, wholeNodes, author, ownership, events);
                if (deleteId) {
                    const last = wholeNodes[wholeNodes.length - 1]!;
                    return markNodesInserted(tr, last.pos + last.node.nodeSize, insertedNodes, author, ownership, events, deleteId);
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

    const reuseId = findReuseId(tr.doc, from, to, suggestionType, ownership);
    const id = reuseId ?? generateSuggestionId();
    if (!reuseId) {
        ownership.noteCreated(id);
        events.push({ kind: "create", id, type: to > from ? "delete" : "insert", author, timestamp: Date.now() });
    }

    let insertAt = to;

    if (to > from) {
        // deleting your own not-yet-resolved insertion should just remove it (cancel
        // the suggestion) rather than mark it as deleted on top of an insert mark;
        // only content that isn't your own pending insertion gets a delete mark
        const mapStart = tr.mapping.maps.length;
        const segments = computeDeletionSegments(tr.doc, from, to, suggestionType, ownership);
        for (let i = segments.length - 1; i >= 0; i--) {
            const seg = segments[i];
            if (seg.cancel) {
                tr.delete(seg.from, seg.to);
            } else {
                tr.addMark(seg.from, seg.to, suggestionType.create({ type: "delete", id }));
            }
        }
        insertAt = subMapping(tr.mapping, mapStart, tr.mapping.maps.length).map(to, -1);
    }

    if (slice.size > 0) {
        const markedContent = addMarkToFragment(slice.content, suggestionType.create({ type: "insert", id }));
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

function handleAddMarkStep(
    tr: Transaction,
    step: AddMarkStep,
    author: Author,
    ownership: OwnershipCheck,
    events: SuggestionEvent[]
) {
    tr.step(step);

    const suggestionType = tr.doc.type.schema.marks.suggestion;
    if (!suggestionType) return;

    tagFormatChange(tr, step.from, step.to, author, suggestionType, ownership, events, { addType: step.mark.type.name });
}

function handleRemoveMarkStep(
    tr: Transaction,
    step: RemoveMarkStep,
    author: Author,
    ownership: OwnershipCheck,
    events: SuggestionEvent[]
) {
    tr.step(step);

    const suggestionType = tr.doc.type.schema.marks.suggestion;
    if (!suggestionType) return;

    tagFormatChange(tr, step.from, step.to, author, suggestionType, ownership, events, {
        removeType: step.mark.type.name,
        removeAttrs: step.mark.attrs
    });
}

function tagFormatChange(
    tr: Transaction,
    from: number,
    to: number,
    author: Author,
    suggestionType: MarkType,
    ownership: OwnershipCheck,
    events: SuggestionEvent[],
    change: { addType?: string; removeType?: string; removeAttrs?: Record<string, any> }
) {
    if (from >= to) return;

    let existing: Mark | undefined;
    tr.doc.nodesBetween(from, to, node => {
        if (existing || !node.isInline) return true;
        const m = findSuggestionMark(node.marks, suggestionType, "format");
        if (m && ownership.isMine(m.attrs.id)) existing = m;
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
        // this change exactly cancels out the previously recorded one - strip just
        // that one format mark instance, not every suggestion mark in range (the
        // insert/delete/comment subtypes share this same mark type, so removing by
        // type here would also strip unrelated pending suggestions/threads)
        if (existing) {
            tr.removeMark(from, to, existing);
            // the id disappears from the doc without ever being explicitly
            // accepted/rejected by a person - clean up its cache/host record
            // the same way an explicit reject would
            events.push({ kind: "resolve", id: existing.attrs.id, decision: "reject" });
        }
        return;
    }

    if (!existing) {
        ownership.noteCreated(id);
        events.push({ kind: "create", id, type: "format", author, timestamp: Date.now() });
    }

    const mark = suggestionType.create({ type: "format", id, add, remove });
    tr.addMark(from, to, mark);
}
