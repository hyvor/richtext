import type { SuggestionsPluginConfig } from './plugins/suggestions/plugin-suggestions';
import type { CollabPluginConfig } from './plugins/collab/plugin-collab';

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

    // Suggestions plugin config
    suggestions?: SuggestionsPluginConfig;

    // Collaborative editing (prosemirror-collab) config. The editor never
    // talks to a server itself - the host provides onSendable and pushes
    // remote steps back in via the Editor component's collab.receiveSteps().
    // Omit to disable collaboration entirely. See plugin-collab.ts and DEV.md.
    collab?: CollabPluginConfig;

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