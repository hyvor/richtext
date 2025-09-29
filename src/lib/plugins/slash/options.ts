import type { Node, Schema } from 'prosemirror-model';
import { type Component, mount, unmount } from 'svelte';
import IconBookmark from '@hyvor/icons/IconBookmark';
import IconCardImage from '@hyvor/icons/IconCardImage';
import IconCode from '@hyvor/icons/IconCode';
import IconCodeSlash from '@hyvor/icons/IconCodeSlash';
import IconHr from '@hyvor/icons/IconHr';
import IconLightbulb from '@hyvor/icons/IconLightbulb';
import IconLink45deg from '@hyvor/icons/IconLink45deg';
import IconListUl from '@hyvor/icons/IconListUl';
import IconQuote from '@hyvor/icons/IconQuote';
import IconSoundwave from '@hyvor/icons/IconSoundwave';
import IconTable from '@hyvor/icons/IconTable';
import IconTypeH2 from '@hyvor/icons/IconTypeH2';
import IconTypeH3 from '@hyvor/icons/IconTypeH3';
import EmbedCreator from './Embed/EmbedCreator.svelte';
import BookmarkCreator from './Bookmark/BookmarkCreator.svelte';
import type { Config } from '../../config';
import type { EditorView } from 'prosemirror-view';
import IconHandIndexThumb from '@hyvor/icons/IconHandIndexThumb';
import { uploadImageGetFigureNode } from '../../nodeviews/image/image-upload'
import { uploadAudioGetAudioNode } from '../../nodeviews/audio/audio-upload';

export interface SlashOption {
	name: string;
	description: string;
	icon: Component;
	keywords: string[];
	node: string | (() => Promise<Node | null>);
	attrs?: Record<string, unknown>;
}

export function getOptions(view: EditorView, config: Config): SlashOption[] {

	const schema = view.state.schema;

	const options: SlashOption[] = [
		{
			name: 'Heading - Large',
			description: 'To divide main sections of the post',
			icon: IconTypeH2,
			keywords: ['heading', 'large', 'title', 'h1', 'h2'],
			node: 'heading',
			attrs: { level: 2 }
		},
		{
			name: 'Heading - Medium',
			description: 'To divide small sections of the post',
			icon: IconTypeH3,
			keywords: ['heading', 'medium', 'title', 'h2', 'h3', 'h4'],
			node: 'heading',
			attrs: { level: 3 }
		},
		{
			name: 'Quote',
			description: 'Capture a quote',
			icon: IconQuote,
			keywords: ['quote', 'blockquote'],
			node: () => createQuote(schema)
		},
		{
			name: 'Callout',
			description: 'Write something standing out',
			icon: IconLightbulb,
			keywords: ['alert', 'notice', 'callout', 'aside'],
			node: 'callout'
		},
		{
			name: 'Divider',
			description: 'Divide sections with a horizontal line',
			icon: IconHr,
			keywords: ['hr', 'divider', 'horizontal', 'line'],
			node: 'horizontal_rule'
		}
	]

	if (config.imageEnabled && config.fileUploader) {
		options.push({
			name: 'Image',
			description: 'Add an image',
			icon: IconCardImage,
			keywords: ['image', 'picture', 'upload'],
			node: () => uploadImageGetFigureNode(schema, config.fileUploader, config.fileMaxSizeInMB),
		});
	}

	if (config.buttonEnabled) {
		options.push({
			name: 'Button',
			description: 'Add a button',
			icon: IconHandIndexThumb,
			keywords: ['button', 'link', 'call to action', 'cta'],
			node: 'button'
		});
	}

	if (config.codeBlockEnabled) {
		options.push({
			name: 'Code Block',
			description: 'A block of code',
			icon: IconCode,
			keywords: ['code', 'snippet'],
			node: 'code_block'
		})
	}

	if (config.customHtmlEnabled) {
		options.push({
			name: 'Custom HTML/Twig',
			description: 'Add custom HTML (or Twig)',
			icon: IconCodeSlash,
			keywords: ['html', 'twig', 'code', 'custom'],
			node: 'custom_html'
		})
	}

	if (config.embedEnabled) {
		options.push({
			name: 'Embed',
			description: 'Embed content from YouTube, Twitter, etc.',
			icon: IconLink45deg,
			keywords: [
				'embed',
				'rich',
				'video',
				'youtube',
				'twitter',
				'facebook',
				'instagram',
				'reddit',
				'github'
			],
			node: createEmbed
		});
	}

	if (config.bookmarkEnabled) {
		options.push({
			name: 'Link Bookmark',
			description: 'Link preview as a bookmark',
			icon: IconBookmark,
			keywords: ['bookmark', 'link'],
			node: createBookmark
		});
	}

	if (config.audioEnabled && config.fileUploader) {
		options.push({
			name: 'Audio',
			description: 'Add an audio',
			icon: IconSoundwave,
			keywords: ['audio', 'sound', 'upload'],
			node: () => uploadAudioGetAudioNode(schema, config.fileUploader, config.fileMaxSizeInMB),
		});
	}

	if (config.tocEnabled) {
		options.push({
			name: 'Table of Contents',
			description: 'Add a table of contents',
			icon: IconListUl,
			keywords: ['toc', 'table of contents', 'contents', 'outline', 'index', 'menu'],
			node: 'toc'
		});
	}

	if (config.tableEnabled) {
		options.push({
			name: 'Table',
			description: 'Add a table',
			icon: IconTable,
			keywords: ['table', 'spreadsheet'],
			node: createTable
		});
	}


	return options;

}

// finds options by best guess
export function findOptions(match: string, options: SlashOption[]): SlashOption[] {
	const matchWords = match
		.toLowerCase()
		.split(/\W+/)
		.filter((str) => str !== '');

	const matched = [];

	for (let i = 0; i < options.length; i++) {
		const { keywords } = options[i]!;

		for (let x = 0, l = keywords.length; x < l; x++) {
			for (let y = 0, yLen = match ? matchWords.length : 1; y < yLen; y++) {
				if (match === '' || keywords[x]!.indexOf(matchWords[y]!) > -1) {
					const item = { ...options[i], score: 0 };
					item.score = x + y;
					if (matched.filter((x) => x.name === item.name).length === 0) {
						matched.push(item);
					}
				}
			}
		}
	}

	return matched.sort((a, b) => a.score - b.score) as SlashOption[];
}

function createQuote(schema: Schema) {
	return Promise.resolve(schema.nodes.blockquote!.create({}, [schema.nodes.paragraph!.create()]));
}

function createEmbed() {
	return new Promise<Node | null>((resolve) => {
		const div = document.createElement('div');
		document.body.appendChild(div);

		const creator = mount(EmbedCreator, {
			target: div,
			props: {
				onclose: () => {
					destroy();
					resolve(null);
				},
				oncreate: (url: string) => {
					destroy();
					resolve(
						schema.nodes.figure!.create({}, [
							schema.nodes.embed!.create({ url }),
							schema.nodes.figcaption!.create()
						])
					);
				},
				oncreatebookmark: (url: string) => {
					destroy();
					resolve(
						schema.nodes.figure!.create({}, [
							schema.nodes.bookmark!.create({ url: url }),
							schema.nodes.figcaption!.create()
						])
					);
				},
				oncreatehtmlblock: (html: string) => {
					destroy();
					resolve(schema.nodes.custom_html!.create({ html }));
				}
			}
		});

		function destroy() {
			unmount(creator);
			div.remove();
		}
	});
}

function createBookmark(url: string = '') {
	return new Promise<Node | null>((resolve) => {
		const div = document.createElement('div');
		document.body.appendChild(div);

		const creator = mount(BookmarkCreator, {
			target: div,
			props: {
				url,
				onclose: () => {
					destroy();
					resolve(null);
				},
				oncreate: (url: string) => {
					destroy();
					resolve(
						schema.nodes.figure!.create({}, [
							schema.nodes.bookmark!.create({ url }),
							schema.nodes.figcaption!.create()
						])
					);
				}
			}
		});

		function destroy() {
			unmount(creator);
			div.remove();
		}
	});
}

function createTable() {
	const rows = [];
	for (let i = 0; i < 3; i++) {
		const cells = [];
		for (let j = 0; j < 3; j++) {
			cells.push(schema.nodes.table_cell!.create({}, [schema.nodes.paragraph!.create()]));
		}
		rows.push(schema.nodes.table_row!.create({}, cells));
	}

	return Promise.resolve(schema.nodes.table!.create({}, [...rows]));
}
