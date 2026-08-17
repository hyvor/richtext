import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";

export interface RemoteCursorUser {
    name: string;
    // any valid CSS color - used for the caret, the tooltip, and (tinted) the
    // selection highlight
    color: string;
    picture?: string;
}

// One other user's current cursor/selection, as last reported to
// `editor.cursors.set()`. `clientId` identifies which user this is across
// updates - a later call replaces, rather than adds to, that same user's
// cursor. It doesn't have to match editorConfig.collab's clientID, though
// reusing it is the natural choice if you're running collab and cursors
// together (see DEV.md).
export interface RemoteCursor {
    clientId: string;
    from: number;
    // equal to `from` for a collapsed caret. If you track selection
    // direction yourself, put the selection's head here - that's where the
    // caret is rendered.
    to: number;
    user: RemoteCursorUser;
}

export interface CursorsPluginConfig {
    // Called (debounced by debounceMs) whenever the local user's selection
    // moves, so the host can broadcast it to other clients over its own
    // transport - the same "editor never talks to a server" split as
    // editorConfig.collab. Called with `null` on blur (immediately, not
    // debounced) so peers can be told this user stepped away, and again with
    // the current selection on focus.
    onLocalCursorChange: (cursor: { from: number; to: number } | null) => void;
    // default 250
    debounceMs?: number;
}

export interface CursorsPluginState {
    cursors: RemoteCursor[];
}

export const cursorsPluginKey = new PluginKey<CursorsPluginState>("cursors");

const SET_CURSORS_META = "setCursors";

/**
 * Renders other users' cursors/selections as decorations (a caret + tinted
 * selection range, with a name tooltip on hovering the caret) and reports
 * the local user's own selection changes via `onLocalCursorChange` so the
 * host can broadcast them. This plugin never talks to a server itself - see
 * `editor.cursors.set()` in Editor.svelte for feeding remote cursors in.
 */
export default function cursorsPlugin(config: CursorsPluginConfig) {
    const debounceMs = config.debounceMs ?? 250;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    // avoids re-notifying the host for a selection/blur state it's already
    // been told about (view.update fires on every transaction, not just
    // selection-affecting ones)
    let lastSent: { from: number; to: number } | null | undefined;

    function emit(cursor: { from: number; to: number } | null, immediate = false) {
        if (cursor === null ? lastSent === null : (lastSent && lastSent.from === cursor.from && lastSent.to === cursor.to)) {
            return;
        }
        lastSent = cursor;
        clearTimeout(debounceTimer);
        if (immediate) config.onLocalCursorChange(cursor);
        else debounceTimer = setTimeout(() => config.onLocalCursorChange(cursor), debounceMs);
    }

    return new Plugin<CursorsPluginState>({
        key: cursorsPluginKey,

        state: {
            init(): CursorsPluginState {
                return { cursors: [] };
            },
            apply(tr, value): CursorsPluginState {
                const cursors = tr.getMeta(SET_CURSORS_META) as RemoteCursor[] | undefined;
                return cursors ? { cursors } : value;
            }
        },

        props: {
            decorations(state) {
                const pluginState = cursorsPluginKey.getState(state);
                if (!pluginState || !pluginState.cursors.length) return null;

                const docSize = state.doc.content.size;
                const decorations: Decoration[] = [];

                for (const cursor of pluginState.cursors) {
                    const from = Math.max(0, Math.min(cursor.from, docSize));
                    const to = Math.max(from, Math.min(cursor.to, docSize));

                    if (to > from) {
                        decorations.push(Decoration.inline(from, to, {
                            class: "remote-cursor-selection",
                            style: `--cursor-color: ${cursor.user.color}`,
                            title: cursor.user.name
                        }));
                    }

                    decorations.push(Decoration.widget(to, () => buildCaret(cursor), {
                        key: `cursor-${cursor.clientId}`,
                        side: 1
                    }));
                }

                return DecorationSet.create(state.doc, decorations);
            },

            handleDOMEvents: {
                blur() {
                    emit(null, true);
                    return false;
                },
                focus(view) {
                    const { from, to } = view.state.selection;
                    emit({ from, to }, true);
                    return false;
                }
            }
        },

        view() {
            return {
                update(view, prevState) {
                    if (prevState.selection.eq(view.state.selection) && prevState.doc.eq(view.state.doc)) return;
                    if (!view.hasFocus()) return;
                    const { from, to } = view.state.selection;
                    emit({ from, to });
                },
                destroy() {
                    clearTimeout(debounceTimer);
                }
            };
        }
    });
}

function buildCaret(cursor: RemoteCursor): HTMLElement {
    const caret = document.createElement("span");
    caret.className = "remote-cursor-caret";
    caret.style.setProperty("--cursor-color", cursor.user.color);

    const flag = document.createElement("span");
    flag.className = "remote-cursor-flag";
    flag.textContent = cursor.user.name;
    caret.appendChild(flag);

    return caret;
}

/**
 * Replaces the full set of remote cursors shown in the editor. The host is
 * expected to track the current roster itself (from whatever its transport
 * broadcasts) and call this with the whole list on every change - see
 * Editor.svelte's `editor.cursors.set()`.
 */
export function setRemoteCursors(view: EditorView, cursors: RemoteCursor[]) {
    const tr = view.state.tr.setMeta(SET_CURSORS_META, cursors);
    tr.setMeta("addToHistory", false);
    view.dispatch(tr);
}
