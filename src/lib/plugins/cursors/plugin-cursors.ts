import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";

export interface RemoteCursorUser {
    name: string;
    // any valid CSS color
    // recommended to use a dark color.
    color: string;
    picture?: string;
}

// One other user's current cursor
// set via `editor.cursors.set()` in Editor.svelte. 
// `clientId` identifies which user this is across updates
export interface RemoteCursor {
    clientId: string;
    from: number;
    to: number;
    user: RemoteCursorUser;
}

export interface CursorsPluginConfig {
    // called when the user's selection changes
    // called with null when the user blurs the editor
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
 * Renders other user's cursors as decorations (caret + tinted selection range + tooltip on hovering)
 * and, reports the current user's own selection changes to the host app via `onLocalCursorChange`
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

// sets all external cursors at once
export function setRemoteCursors(view: EditorView, cursors: RemoteCursor[]) {
    const tr = view.state.tr.setMeta(SET_CURSORS_META, cursors);
    tr.setMeta("addToHistory", false);
    view.dispatch(tr);
}
