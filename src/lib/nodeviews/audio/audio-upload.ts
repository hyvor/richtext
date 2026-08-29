import type { EditorConfig } from "$lib/config";
import { uploadFile } from "@hyvor/design/components";
import { type Schema } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import { setNodeAttrs } from "../../plugins/suggestions/commands";

export async function uploadAudio(fileUploader: EditorConfig['fileUploader'], fileMaxSizeInMB: EditorConfig['fileMaxSizeInMB']) {
    return await uploadFile({
        type: 'audio',
        uploader: (blob, name) => fileUploader(blob, name, 'audio'),
        maxFileSizeInMB: fileMaxSizeInMB,
    });
}

export async function uploadAudioGetAudioNode(
    schema: Schema,
    fileUploader: EditorConfig['fileUploader'],
    fileMaxSizeInMB: EditorConfig['fileMaxSizeInMB']
) {
    const audio = await uploadAudio(fileUploader, fileMaxSizeInMB);

    if (audio === null) {
        return null;
    }

    return getAudioNode(schema, audio.url);
}

export function getAudioNode(schema: Schema, url: string) {
    return schema.nodes.audio.create({
        src: url,
    });
}

/**
 * Swaps an existing audio node's src for a freshly uploaded one - used by the
 * node menu's "Change audio" action, which only has the audio node's doc
 * position to work with (no NodeView getPos()).
 */
export function applyChangedAudio(view: EditorView, audioPos: number, url: string) {
    const node = view.state.doc.nodeAt(audioPos);
    if (!node) return;
    setNodeAttrs(view, audioPos, { ...node.attrs, src: url });
}