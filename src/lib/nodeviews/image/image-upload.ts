import type { Config, ImageUploadResult } from "$lib/config";
import { uploadFile } from "@hyvor/design/components";
import { DOMParser, type Schema } from "prosemirror-model";

export async function uploadImage(fileUploader: Config['fileUploader'], fileMaxSizeInMB: Config['fileMaxSizeInMB']) {
    const image = await uploadFile({
        type: 'image',
        uploader: (file, name) => fileUploader(file, name, 'image'),
        maxFileSizeInMB: fileMaxSizeInMB
    });

    if (image === null) {
        return null;
    }

    const result: ImageUploadResult = {
        src: image.url,
        // TODO: set caption if unsplash
    }

    return result;
}

export async function uploadImageGetFigureNode(
    schema: Schema,
    fileUploader: Config['fileUploader'],
    fileMaxSizeInMB: Config['fileMaxSizeInMB']
) {
    const image = await uploadImage(fileUploader, fileMaxSizeInMB);

    if (image === null) {
        return null;
    }

    return getFigureNode(schema, image);

}

export function getFigureNode(
    schema: Schema,
    result: ImageUploadResult
) {

    // parse from HTML
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