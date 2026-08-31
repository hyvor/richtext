import type { ImageUploadResult, UploadFileConfig } from "$lib/config";
import { uploadFile } from "@hyvor/design/components";
import { DOMParser, type Schema } from "prosemirror-model";
import { NodeSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { setNodeAttrs } from "../../plugins/suggestions/commands";

export async function uploadImage(uploadFileConfig: UploadFileConfig) {
    const image = await uploadFile({
        type: 'image',
        uploader: (file, name) => uploadFileConfig.uploader(file, name, 'image'),
        maxFileSizeInMB: uploadFileConfig.maxFileSizeInMB,
        mediaLoad: uploadFileConfig.mediaLoad,
        unsplashSearch: uploadFileConfig.unsplashSearch,
        excalidraw: uploadFileConfig.excalidraw
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
    uploadFileConfig: UploadFileConfig
) {
    const image = await uploadImage(uploadFileConfig);

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

export function applyChangedImage(view: EditorView, imagePos: number, image: ImageUploadResult) {
    const node = view.state.doc.nodeAt(imagePos);
    if (!node) return;

    setNodeAttrs(view, imagePos, {
        ...node.attrs,
        src: image.src,
        alt: image.alt || ''
    });

    if (image.caption) {
        const schema = view.state.schema;
        const nodeSel = NodeSelection.create(view.state.doc, imagePos + 1);

        const tr = view.state.tr;
        const newFigcaption = getFigureNode(schema, image).content.content[1];
        tr.replaceWith(nodeSel.from, nodeSel.to, newFigcaption);

        view.dispatch(tr);
    }
}