import type { EditorState, PluginView } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { suggestionsPluginKey, collectSuggestionIds, type SuggestionSourceEntry } from "./plugin-suggestions";

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
                this.notify(() => pluginState.source.create(ev.id, ev.type, ev.author, ev.timestamp));
            } else if (ev.kind === "reply") {
                this.notify(() => pluginState.source.reply(ev.id, ev.reply));
            } else if (ev.kind === "editReply") {
                if (pluginState.source.editReply) {
                    this.notify(() => pluginState.source.editReply!(ev.id, ev.replyId, ev.content));
                }
            } else if (ev.kind === "deleteReply") {
                if (pluginState.source.deleteReply) {
                    this.notify(() => pluginState.source.deleteReply!(ev.id, ev.replyId));
                }
            } else if (ev.kind === "resolve") {
                if (pluginState.source.resolve) {
                    const decision = ev.decision;
                    this.notify(() => pluginState.source.resolve!(ev.id, decision));
                }
            }
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
