
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
    bookmarkEnabled: true,
    tocEnabled: true,
    audioEnabled: true,
    tableEnabled: true,
    buttonEnabled: true,
};