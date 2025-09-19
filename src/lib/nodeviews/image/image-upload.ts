import type { Config, ImageUploadResult } from "$lib/config";
import { DOMParser, type Schema } from "prosemirror-model";

export async function uploadImageGetFigureNode(schema: Schema, imageUploader: Config['imageUploader']) {

    const image = await imageUploader();

    if (image === null) {
        return null;
    }

    return getFigureNode(schema, image);
}

export function getFigureNode(schema: Schema, result: ImageUploadResult) {

    function getCaptionText(caption: string) {
        const parser = DOMParser.fromSchema(schema);
        const tempEl = document.createElement('div');
        tempEl.innerHTML = caption;
        const doc = parser.parse(tempEl);
        // doc -> fragment -> paragraph ->
        const texts = doc.content.content[0].content;
        return texts;
    }

    return schema.nodes.figure.create({}, [
        schema.nodes.image.create({
            src: result.src,
            alt: result.alt ?? ''
        }),
        schema.nodes.figcaption.create(
            {},
            result.caption ? getCaptionText(result.caption) : []
        )
    ]);
}