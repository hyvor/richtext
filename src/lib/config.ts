
export interface Config {

    // Colors
    // ======
    colorButtonBackground: string;
    colorButtonText: string;

    // Schema
    // ======

    // code block
    // default: true
    codeBlockEnabled: boolean;

    // custom HTML/Twig block
    // default: true
    customHtmlEnabled: boolean;

    // Embed block
    // default: true
    embedEnabled: boolean;

    // Image block
    // default: true
    imageEnabled: boolean;
    imageUploader?: () => Promise<ImageUploadResult | null>;

    // Audio
    // default: true
    audioEnabled: boolean;

    // File uploader config (from HDS)
    // fileUploader must be provided if imageEnabled or audioEnabled is true
    fileUploader?: (file: File, name: string | null) => Promise<{ url: string } | null>;
    fileMaxSizeInMB?: number; // default: 10

    audioUploader?: () => Promise<AudioUploadResult | null>;

    // Bookmark block
    // default: true
    bookmarkEnabled: boolean;

    // TOC: Table of Contents
    // default: true
    tocEnabled: boolean;

    // Table
    // default: true
    tableEnabled: boolean;

    // Button
    // default: true
    buttonEnabled: boolean;

}

export const defaultConfig: Config = {
    colorButtonBackground: '#000',
    colorButtonText: '#fff',

    codeBlockEnabled: true,
    customHtmlEnabled: true,
    embedEnabled: true,
    imageEnabled: true,
    imageUploader: undefined,
    audioEnabled: true,
    audioUploader: undefined,
    bookmarkEnabled: true,
    tocEnabled: false,
    tableEnabled: true,
    buttonEnabled: true,
};

export interface ImageUploadResult {
    src: string;
    alt?: string;
    caption?: string; // HTML supported
}

export interface AudioUploadResult {
    src: string;
}