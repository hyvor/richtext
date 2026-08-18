import type { Mark } from "prosemirror-model";
import type { EditorView, MarkView } from "prosemirror-view";

const TAG: Record<string, string> = {
    insert: "ins",
    delete: "del",
    format: "span",
};

const TITLE: Record<string, string> = {
    insert: "Suggested insertion",
    delete: "Suggested deletion",
    format: "Suggested formatting",
};

// Renders the unified `suggestion` mark (see schema.ts) - one MarkView for
// all four subtypes, since ProseMirror registers mark views per mark *type*,
// not per attrs. insert/delete/format reproduce the schema's plain toDOM
// output exactly (dom === contentDOM, no extra wrapper) so real edits inside
// them keep flowing through the suggestions plugin's appendTransaction
// unchanged. "comment" reproduces the old dedicated CommentMarkView: content
// wrapped in its own contentDOM child, with ignoreMutation so browser-only
// DOM changes inside a commented range (e.g. spellcheck) aren't misread as
// document edits - deliberately *not* applied to insert/delete/format, which
// rely on exactly that mutation tracking to work.
export default class SuggestionMarkView implements MarkView {

    dom: HTMLElement;
    contentDOM: HTMLElement;
    mark: Mark;
    view: EditorView;

    constructor(mark: Mark, view: EditorView, inline: boolean) {
        this.mark = mark;
        this.view = view;

        const type = mark.attrs.type as string;

        if (type === "comment") {
            this.dom = document.createElement(inline ? "span" : "div");
            this.dom.classList.add("user-comment");
            this.dom.dataset.suggestionId = mark.attrs.id;
            this.contentDOM = document.createElement(inline ? "span" : "div");
            this.dom.appendChild(this.contentDOM);
        } else {
            this.dom = this.contentDOM = document.createElement(TAG[type] ?? "span");
            this.dom.className = `suggestion-${type}`;
            this.dom.dataset.suggestionId = mark.attrs.id;
            this.dom.title = TITLE[type] ?? "";
        }
    }

    update(mark: Mark) {
        if (mark.type !== this.mark.type) return false;
        // a structural change (different tag/wrapping) needs a fresh view
        if (mark.attrs.type !== this.mark.attrs.type) return false;
        this.mark = mark;
        this.dom.dataset.suggestionId = mark.attrs.id;
        return true;
    }

    destroy() {
        this.dom.remove();
    }

    ignoreMutation() {
        return this.mark.attrs.type === "comment";
    }

}
