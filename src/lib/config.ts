
export interface Config {

    // Colors
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

    // Bookmark block
    // default: true
    bookmarkEnabled: boolean;

    // TOC: Table of Contents
    // default: true
    tocEnabled: boolean;

    // Audio
    // default: true
    audioEnabled: boolean;

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
    bookmarkEnabled: true,
    tocEnabled: true,
    audioEnabled: true,
    tableEnabled: true,
    buttonEnabled: true,
};

export interface ImageUploadResult {
    src: string;
    alt?: string;
    caption?: string; // HTML supported
}