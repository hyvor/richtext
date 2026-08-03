import type { EditorView } from "prosemirror-view";
import { writable } from "svelte/store";
import type { Config } from "./config";
import type { SuggestionMode, SuggestionUser } from "./plugins/suggestions/plugin-suggestions";

export interface Props {

    editorView?: EditorView;

    /**
     * The initial value of the editor.
     */
    value?: string | null;

    /**
     * Listen to DOM events of the Prosemirror editor.
     * Only focus and blur are supported.
     */
    ondomevent?: (name: keyof HTMLElementEventMap, event: Event) => void;

    /**
     * Called when the editor's content changes. value is in ProseMirror JSON format.
     */
    onvaluechange?: (value: string) => void;


    /**
     * Whether the current language is right-to-left.
     */
    rtl?: boolean;

    /**
     * The configuration for the editor.
     */
    config?: Partial<Config>;

    /**
     * The user attributed to any new suggestions made in suggestion mode.
     */
    suggestionUser?: SuggestionUser;

    /**
     * The initial suggestion mode ('editing' or 'suggesting'). Defaults to 'editing'.
     * Use setSuggestionMode(view, mode) to change it at runtime.
     */
    suggestionMode?: SuggestionMode;

}

export interface Store {
    props: Props;
    view: EditorView;
}

export const editorStore = writable<Store>();
export const editorContent = writable<string | null>(null);