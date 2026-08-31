import type { UploadFileConfig } from "$lib/config";
import { uploadFile } from "@hyvor/design/components";
import { type Schema } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import { setNodeAttrs } from "../../plugins/suggestions/commands";

export async function uploadAudio(uploadFileConfig: UploadFileConfig) {
    return await uploadFile({
        type: 'audio',
        uploader: (blob, name) => uploadFileConfig.uploader(blob, name, 'audio'),
        maxFileSizeInMB: uploadFileConfig.maxFileSizeInMB,
        mediaLoad: uploadFileConfig.mediaLoad,
    });
}

export async function uploadAudioGetAudioNode(
    schema: Schema,
    uploadFileConfig: UploadFileConfig
) {
    const audio = await uploadAudio(uploadFileConfig);

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

export function applyChangedAudio(view: EditorView, audioPos: number, url: string) {
    const node = view.state.doc.nodeAt(audioPos);
    if (!node) return;
    setNodeAttrs(view, audioPos, { ...node.attrs, src: url });
}