import type { Mark } from "prosemirror-model";
import type { EditorView, MarkView, MarkViewConstructor } from "prosemirror-view";
import SuggestionMarkView from "./markview-suggestion";

interface MarkViewsType {
	[key: string]: MarkViewConstructor;
}


export function getMarkViews(): MarkViewsType {
    return {
        suggestion(mark: Mark, view: EditorView, inline: boolean): MarkView {
            return new SuggestionMarkView(mark, view, inline);
        }
    };
}