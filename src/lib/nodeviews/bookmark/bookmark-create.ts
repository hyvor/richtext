import type { BookmarkResult, Config } from "$lib/config";
import { type Schema } from "prosemirror-model";

export async function createBookmarkGetFigureNode(schema: Schema, bookmarkGetter: Config['bookmarkGetter']) {

    const bookmark = await bookmarkGetter();

    if (bookmark === null) {
        return null;
    }

    return getFigureNode(schema, bookmark);
}

export function getFigureNode(schema: Schema, result: BookmarkResult) {
    return schema.nodes.figure.create({}, [
        schema.nodes.bookmark.create({
            url: result.url
        }),
        schema.nodes.figcaption.create()
    ]);
}
