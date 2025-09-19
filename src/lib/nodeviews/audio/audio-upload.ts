import type { AudioUploadResult, Config } from "$lib/config";
import { type Schema } from "prosemirror-model";

export async function uploadAudioGetAudioNode(schema: Schema, audioUploader: Config['audioUploader']) {

    const audio = await audioUploader();

    if (audio === null) {
        return null;
    }

    return getAudioNode(schema, audio);
}

export function getAudioNode(schema: Schema, result: AudioUploadResult) {
    return schema.nodes.audio.create({
        src: result.src,
    });
}