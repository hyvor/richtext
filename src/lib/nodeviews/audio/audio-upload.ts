import type { Config } from "$lib/config";
import { uploadFile } from "@hyvor/design/components";
import { type Schema } from "prosemirror-model";

export async function uploadAudio(fileUploader: Config['fileUploader'], fileMaxSizeInMB: Config['fileMaxSizeInMB']) {
    return await uploadFile({
        type: 'audio',
        uploader: (blob, name) => fileUploader(blob, name, 'audio'),
        maxFileSizeInMB: fileMaxSizeInMB,
    });
}

export async function uploadAudioGetAudioNode(
    schema: Schema,
    fileUploader: Config['fileUploader'],
    fileMaxSizeInMB: Config['fileMaxSizeInMB']
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