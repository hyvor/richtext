import type { EditorView } from "prosemirror-view";
import type { Plugin } from "prosemirror-state";
import { writable } from "svelte/store";
import type { Config } from "./config";

export interface Props {

    editorView?: EditorView;

    /**
     * The initial value of the editor.
     */
    value?: string | null;

    /**
     * called when the editor is initialized. The editorView is passed as an argument.
     */
    oninit?: (editorView: EditorView) => void;

    /**
     * whether the editor is initially editable or not (default true).
     * call setEditable() to change the readonly state after initialization.
     */
    editable?: boolean;

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
     * Additional ProseMirror plugins to use, on top of the built-in ones.
     */
    plugins?: Plugin[];

}

export interface Store {
    props: Props;
    view: EditorView;
}

export const editorStore = writable<Store>();
export const editorContent = writable<string | null>(null);