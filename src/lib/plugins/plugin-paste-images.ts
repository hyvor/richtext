import { Fragment, Slice, type Node, type Schema } from 'prosemirror-model';
import { Plugin, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { EditorConfig, UploadFileConfig } from '$lib/config';
import { getFigureNode } from '../nodeviews/image/image-upload';
import { setNodeAttrs } from './suggestions/commands';

export default function pasteImagesPlugin(schema: Schema, config: EditorConfig) {
	return new Plugin({
		props: {
			transformPasted(slice) {
				if (!schema.nodes.image || !schema.nodes.figure) return slice;
				return new Slice(
					wrapBareImages(slice.content, schema),
					slice.openStart,
					slice.openEnd
				);
			},

			handlePaste(view, event, slice) {
				if (!view.editable || !schema.nodes.image) return false;

				const files = imageFilesFrom(event.clipboardData);
				if (files.length && !sliceHasText(slice)) {
					void insertAndUploadFiles(view, files, config);
					return true;
				}

				const uploadFileConfig = config.uploadFileConfig;
				const srcs = imageSrcsIn(slice.content);
				if (srcs.length && uploadFileConfig?.uploader) {
					setTimeout(() => {
						void uploadAndReplaceImages(srcs, view, uploadFileConfig);
					});
				}

				return false;
			},

			handleDrop(view, event, _slice, moved) {
				if (moved || !view.editable || !schema.nodes.image) return false;

				const files = imageFilesFrom(event.dataTransfer);
				if (!files.length) return false;

				const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
				if (coords) {
					view.dispatch(
						view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(coords.pos)))
					);
				}

				void insertAndUploadFiles(view, files, config);
				return true;
			}
		}
	});
}

function wrapBareImages(fragment: Fragment, schema: Schema, parentIsFigure = false): Fragment {
	const imageType = schema.nodes.image;
	const figureType = schema.nodes.figure;
	const captionType = schema.nodes.figcaption;
	if (!imageType || !figureType || !captionType) return fragment;

	const children: Node[] = [];
	fragment.forEach((node) => {
		if (node.type === imageType && !parentIsFigure) {
			children.push(figureType.create(null, [node, captionType.create()]));
			return;
		}
		if (node.content.size > 0) {
			children.push(
				node.copy(wrapBareImages(node.content, schema, node.type === figureType))
			);
			return;
		}
		children.push(node);
	});

	return Fragment.fromArray(children);
}

function imageFilesFrom(data: DataTransfer | null): File[] {
	if (!data) return [];

	const fromList = Array.from(data.files).filter((file) => file.type.startsWith('image/'));
	if (fromList.length) return fromList;

	const fromItems: File[] = [];
	for (const item of Array.from(data.items)) {
		if (item.kind === 'file' && item.type.startsWith('image/')) {
			const file = item.getAsFile();
			if (file) fromItems.push(file);
		}
	}
	return fromItems;
}

function sliceHasText(slice: Slice): boolean {
	let found = false;
	slice.content.descendants((node) => {
		if (node.isText && node.text!.trim()) found = true;
	});
	return found;
}

function imageSrcsIn(fragment: Fragment): string[] {
	const srcs: string[] = [];
	fragment.descendants((node) => {
		if (node.type.name === 'image' && typeof node.attrs.src === 'string' && node.attrs.src) {
			srcs.push(node.attrs.src);
		}
	});
	return [...new Set(srcs)];
}

async function insertAndUploadFiles(view: EditorView, files: File[], config: EditorConfig) {
	const schema = view.state.schema;
	if (!schema.nodes.image || !schema.nodes.figure) return;

	const pending: { tempSrc: string; file: File }[] = [];
	const figures: Node[] = [];

	for (const file of files) {
		if (!withinSizeLimit(file, config.uploadFileConfig?.maxFileSizeInMB)) continue;
		const tempSrc = URL.createObjectURL(file);
		pending.push({ tempSrc, file });
		figures.push(getFigureNode(schema, { src: tempSrc }));
	}

	if (!figures.length) return;

	view.dispatch(
		view.state.tr.replaceSelection(new Slice(Fragment.fromArray(figures), 0, 0)).scrollIntoView()
	);

	const uploader = config.uploadFileConfig?.uploader;
	if (!uploader) return;

	for (const { tempSrc, file } of pending) {
		if (view.isDestroyed) return;
		try {
			const result = await uploader(file, file.name || null, 'image');
			if (result?.url) {
				replaceImageSrc(view, tempSrc, result.url);
				URL.revokeObjectURL(tempSrc);
			}
		} catch {
			// keep the object-URL preview if the host rejects the upload
		}
	}
}

async function uploadAndReplaceImages(
	srcs: string[],
	view: EditorView,
	uploadFileConfig: UploadFileConfig
) {
	for (const src of srcs) {
		if (view.isDestroyed) return;
		try {
			const blob = await fetch(src).then((res) => {
				if (!res.ok) throw new Error('fetch failed');
				return res.blob();
			});
			if (blob.type.indexOf('image') === -1) continue;
			if (!withinSizeLimit(blob, uploadFileConfig.maxFileSizeInMB)) continue;

			const result = await uploadFileConfig.uploader(blob, nameFromSrc(src), 'image');
			if (result?.url && result.url !== src) replaceImageSrc(view, src, result.url);
		} catch {
			// leave the original src (e.g. CORS-blocked remote images)
		}
	}
}

function replaceImageSrc(view: EditorView, currentUrl: string, newUrl: string) {
	const positions: number[] = [];
	view.state.doc.descendants((node, pos) => {
		if (node.type.name === 'image' && node.attrs.src === currentUrl) {
			positions.push(pos);
		}
	});

	for (const pos of positions) {
		const node = view.state.doc.nodeAt(pos);
		if (!node) continue;
		setNodeAttrs(view, pos, { ...node.attrs, src: newUrl });
	}
}

function withinSizeLimit(blob: Blob, maxFileSizeInMB?: number) {
	if (!maxFileSizeInMB) return true;
	return blob.size <= maxFileSizeInMB * 1024 * 1024;
}

function nameFromSrc(src: string): string | null {
	try {
		const last = new URL(src, window.location.href).pathname.split('/').pop();
		return last || null;
	} catch {
		return null;
	}
}
