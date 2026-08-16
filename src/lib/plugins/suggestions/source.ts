import type { EditorState, PluginView } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { suggestionsPluginKey, collectSuggestionIds, type SuggestionSourceEntry } from "./plugin-suggestions";

// Bridges the suggestions plugin's document-local ids to the host's
// SuggestionSource (see plugin-suggestions.ts) - the one place host callbacks
// actually get called, always post-commit (never from inside
// appendTransaction, which must stay a pure transaction-building function).
//
// Two jobs:
//  1. Fire source.create/reply/resolve once for each event the just-applied
//     transaction recorded (state.pendingEvents), so the host's own store
//     stays in sync with what happened locally.
//  2. Discover suggestion/comment ids present in the doc that the plugin's
//     cache doesn't know about yet (freshly loaded document, or another
//     session's suggestion arriving via some future collab sync) and fetch
//     them in one batched source.get() call - deferred via queueMicrotask so
//     a synchronous same-turn seed (see commands.ts's seedSuggestionSource,
//     used by app/DiffPage.svelte) gets a chance to land first and avoid an
//     unnecessary round trip for ids that are only ever local.
export class SuggestionsSourceView implements PluginView {

    private view: EditorView;
    private destroyed = false;
    private pendingFetch = new Set<string>();
    private flushScheduled = false;

    constructor(view: EditorView) {
        this.view = view;
        this.sync(null);
    }

    update(view: EditorView, prevState: EditorState) {
        this.view = view;
        this.sync(prevState);
    }

    destroy() {
        this.destroyed = true;
    }

    private sync(prevState: EditorState | null) {
        const pluginState = suggestionsPluginKey.getState(this.view.state);
        if (!pluginState) return;

        for (const ev of pluginState.pendingEvents) {
            if (ev.kind === "create") {
                this.notify(() => pluginState.source.create(ev.id, ev.type, ev.author));
            } else if (ev.kind === "reply") {
                this.notify(() => pluginState.source.reply(ev.id, ev.reply));
            } else if (ev.kind === "resolve") {
                if (pluginState.source.resolve) {
                    const decision = ev.decision;
                    this.notify(() => pluginState.source.resolve!(ev.id, decision));
                }
            }
            // "loaded" events are informational only (a source.get() batch
            // reporting back in) - nothing to notify the host about.
        }

        if (!prevState || !prevState.doc.eq(this.view.state.doc)) {
            const suggestionType = this.view.state.schema.marks.suggestion;
            if (!suggestionType) return;
            for (const id of collectSuggestionIds(this.view.state.doc, suggestionType)) {
                if (!(id in pluginState.cache)) this.pendingFetch.add(id);
            }
            this.scheduleFlush();
        }
    }

    private scheduleFlush() {
        if (this.flushScheduled || !this.pendingFetch.size) return;
        this.flushScheduled = true;
        queueMicrotask(() => this.flush());
    }

    private flush() {
        this.flushScheduled = false;
        if (this.destroyed) {
            this.pendingFetch.clear();
            return;
        }

        const pluginState = suggestionsPluginKey.getState(this.view.state);
        if (!pluginState) {
            this.pendingFetch.clear();
            return;
        }

        // re-check cache membership at flush time - a synchronous seed call
        // issued between scheduling and this microtask running may already
        // have filled some of these in
        const ids = [...this.pendingFetch].filter(id => !(id in pluginState.cache));
        this.pendingFetch.clear();
        if (!ids.length) return;

        Promise.resolve(pluginState.source.get(ids))
            .then(result => {
                if (this.destroyed) return;
                const entries: Record<string, SuggestionSourceEntry | null> = {};
                for (const id of ids) entries[id] = result[id] ?? null;
                this.view.dispatch(this.view.state.tr.setMeta(suggestionsPluginKey, {
                    events: [{ kind: "loaded", entries }]
                }));
            })
            .catch(e => console.error("suggestions plugin: source.get failed", e));
    }

    private notify(fn: () => void) {
        try {
            Promise.resolve(fn()).catch(e => console.error("suggestions plugin: source notify failed", e));
        } catch (e) {
            console.error("suggestions plugin: source notify failed", e);
        }
    }
}
