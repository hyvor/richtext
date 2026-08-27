import type { SuggestionsPluginConfig } from './plugins/suggestions/plugin-suggestions';
import type { CollabPluginConfig } from './plugins/collab/plugin-collab';
import type { CursorsPluginConfig } from './plugins/cursors/plugin-cursors';

// all defaults to true
export interface SchemaConfig {
    codeBlock: boolean;
    customHtml: boolean;
    embed: boolean;
    image: boolean;
    audio: boolean;
    bookmark: boolean;
    toc: boolean;
    table: boolean;
    button: boolean;
    suggestions: boolean; // suggestions AND comments
}

export const defaultSchemaConfig: SchemaConfig = {
    codeBlock: true,
    customHtml: true,
    embed: true,
    image: true,
    audio: true,
    bookmark: true,
    toc: true,
    table: true,
    button: true,
    
    suggestions: false,
};

export interface EditorConfig {

    // Colors
    colorButtonBackground: string;
    colorButtonText: string;

    // Code block
    codeBlockConfig: {
        language: boolean;
        annotations: boolean;
        annotationsUrl: string | null;
        fileName: boolean;
    }

    // File uploader config (from HDS)
    // This will be used when the user uploads an image or audio.
    // fileUploader must be provided if imageEnabled or audioEnabled is true
    fileUploader?: (file: Blob, name: string | null, type: 'image' | 'audio') => Promise<{ url: string } | null>;
    fileMaxSizeInMB?: number; // default: 10

    // return the iframe URL (preferably Unfold Iframe) or null if the URL cannot be embedded.
    embed?: (url: string) => Promise<string | null>;
    // return link preview data or null if the URL cannot be previewed.
    bookmark?: (url: string) => Promise<BookmarkLink | null>;

    // Suggestions plugin config
    suggestions?: SuggestionsPluginConfig;

    // Collaborative editing (prosemirror-collab) config. 
    // the host provides onSendable and pushes
    // remote steps back in via the Editor component's collab.receiveSteps().
    // Omit to disable collaboration entirely.
    collab?: CollabPluginConfig;

    // when set, enables the cursor plugin.
    // callback `onLocalCursorChange` is called (debounced by `debounceMs`) whenever 
    // the local user's selection moves. Host should distribute this to other clients
    // for example via WebSocket.
    // to set other users' cursors, use `editor.cursors.set()`
    cursors?: CursorsPluginConfig;

}

export const defaultEditorConfig: EditorConfig = {
    colorButtonBackground: '#000',
    colorButtonText: '#fff',

    codeBlockConfig: {
        language: true,
        annotations: true,
        annotationsUrl: null,
        fileName: true,
    },
};

export interface ImageUploadResult {
    src: string;
    alt?: string;
    caption?: string; // HTML supported
}

export interface BookmarkLink {
    url: string;
    title: string | null;
    description: string | null;
    siteName: string | null;
    siteUrl: string | null;
    thumbnailUrl: string | null;
    iconUrl: string | null;
}