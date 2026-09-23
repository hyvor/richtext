import { EditorView } from 'prosemirror-view';
import { Plugin } from 'prosemirror-state';
import type { UploadFileConfig } from '$lib/config';
import { getFigureNode } from '../nodeviews/image/image-upload';
import { setNodeAttrs } from './suggestions/commands';

/**
 * Uploads pasted images through the host's uploader:
 * - image files on the clipboard (e.g. screenshots) are uploaded and inserted as figures
 * - images inside pasted HTML are pasted as-is, then re-uploaded and their src replaced
 */
export default function pasteImagesPlugin(uploadFileConfig: UploadFileConfig) {
	return new Plugin({
		props: {
			handlePaste: (view, e, slice) => {
				const files = Array.from(e.clipboardData?.files ?? []).filter((file) =>
					file.type.startsWith('image/')
				);

				// only files (no HTML) -> nothing for ProseMirror to paste, so we insert them
				if (files.length && !e.clipboardData?.getData('text/html')) {
					uploadAndInsertFiles(files, view, uploadFileConfig);
					return true;
				}

				const images: string[] = [];
				slice.content.descendants((node) => {
					if (node.type.name === 'image' && node.attrs.src) {
						images.push(node.attrs.src);
					}
				});

				if (images.length) {
					// let the default paste run first, then swap the srcs
					setTimeout(() => uploadAndReplaceImages(images, view, uploadFileConfig), 0);
				}

				return false;
			}
		}
	});
}

function isTooLarge(blob: Blob, uploadFileConfig: UploadFileConfig) {
	const max = uploadFileConfig.maxFileSizeInMB;
	return max !== undefined && blob.size > max * 1024 * 1024;
}

async function uploadAndInsertFiles(files: File[], view: EditorView, uploadFileConfig: UploadFileConfig) {
	for (const file of files) {
		if (isTooLarge(file, uploadFileConfig)) continue;

		try {
			const uploaded = await uploadFileConfig.uploader(file, file.name || null, 'image');
			if (!uploaded || view.isDestroyed) continue;

			const figure = getFigureNode(view.state.schema, { src: uploaded.url });
			view.dispatch(view.state.tr.replaceSelectionWith(figure).scrollIntoView());
		} catch (e) {
			console.error('[richtext] failed to upload pasted image', e);
		}
	}
}

async function uploadAndReplaceImages(imageUrls: string[], view: EditorView, uploadFileConfig: UploadFileConfig) {
	for (const url of new Set(imageUrls)) {
		try {
			const blob = await fetch(url).then((res) => res.blob());
			if (!blob.type.startsWith('image/') || isTooLarge(blob, uploadFileConfig)) continue;

			const uploaded = await uploadFileConfig.uploader(blob, null, 'image');
			if (!uploaded || view.isDestroyed) continue;

			replaceImage(url, uploaded.url, view);
		} catch (e) {
			// e.g. CORS: keep the original src
			console.error('[richtext] failed to upload pasted image', url, e);
		}
	}
}

function replaceImage(currentUrl: string, newUrl: string, view: EditorView) {
	const positions: number[] = [];
	view.state.doc.descendants((node, pos) => {
		if (node.type.name === 'image' && node.attrs.src === currentUrl) {
			positions.push(pos);
		}
	});

	for (const pos of positions) {
		const node = view.state.doc.nodeAt(pos);
		if (node) setNodeAttrs(view, pos, { ...node.attrs, src: newUrl });
	}
}
