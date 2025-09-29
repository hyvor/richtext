export const VALID_MIME_TYPES_AUDIO = [
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'audio/webm'
];

export const VALID_MIME_TYPES_NAMES_AUDIO = VALID_MIME_TYPES_AUDIO.map(
    m => m.split('/')[1]?.split('+')[0]
);