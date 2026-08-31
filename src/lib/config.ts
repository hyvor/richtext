import type { SuggestionsPluginConfig } from './plugins/suggestions/plugin-suggestions';
import type { CollabPluginConfig } from './plugins/collab/plugin-collab';
import type { CursorsPluginConfig } from './plugins/cursors/plugin-cursors';
import type { FileUploaderConfig } from '@hyvor/design/components';

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

export type UploadFileConfig = {
    uploader: (file: Blob, name: string | null, type: 'image' | 'audio') => Promise<{ url: string } | null>;
} & Pick<FileUploaderConfig, 'maxFileSizeInMB' | 'mediaLoad' | 'unsplashSearch' | 'excalidraw'>;

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

    // File uploader (from HDS). Required if image or audio is enabled.
    uploadFileConfig?: UploadFileConfig;

    /**
     * @deprecated use uploadFileConfig.uploader instead.
     */
    fileUploader?: UploadFileConfig['uploader'];

    /**
     * @deprecated use uploadFileConfig.maxFileSizeInMB instead.
     */
    fileMaxSizeInMB?: number;

    image: {
        // Note shown on an image when it's wider than its displayed size in
        // the editor. Override for i18n or different wording.
        oversizedNoteText: string;
    };

    // Return the iframe URL (preferably Unfold Iframe), or null if not embeddable.
    embed?: (url: string) => Promise<string | null>;
    // Return link preview data, or null if the URL cannot be previewed.
    bookmark?: (url: string) => Promise<BookmarkLink | null>;

    // Suggestions plugin config
    suggestions?: SuggestionsPluginConfig;

    // Collaborative editing (prosemirror-collab). The host provides onSendable and
    // pushes remote steps back via the Editor component's collab.receiveSteps().
    // Omit to disable collaboration.
    collab?: CollabPluginConfig;

    // Enables the cursor plugin. `onLocalCursorChange` fires (debounced by
    // `debounceMs`) when the local selection moves; the host distributes it to
    // other clients (e.g. via WebSocket). Set other users' cursors with
    // `editor.cursors.set()`.
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

    image: {
        oversizedNoteText: 'Image size is larger than the image preview in the editor.',
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
