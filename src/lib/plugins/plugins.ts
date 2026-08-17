import placeholderPlugin from './plugin-placeholder';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { history } from 'prosemirror-history';
import inputRulesPlugin from './plugin-inputrules';
import keymapPlugins from './plugin-keymap';
import pasteImagesPlugin from './plugin-paste-images';
import { columnResizing, tableEditing } from 'prosemirror-tables';
import marksTooltipPlugin from './marks-tooltip/plugin-marks-tooltip.svelte.js';
import wordCountPlugin from './plugin-wordcount';
import slashPlugin from './slash/plugin-slash.svelte.js';
import slashTipPlugin from './slash/plugin-slash-tip';
import tableMenuPlugin from './table/plugin-table-menu.svelte.js';
import type { Schema } from 'prosemirror-model';
import buttonTooltipPlugin from './button-tooltip/plugin-button-tooltip.svelte';
import type { EditorConfig } from '$lib/config';
import nodeMenuPlugin from './nodeMenu/plugin-nodemenu.svelte.js';
import suggestionsPlugin from './suggestions/plugin-suggestions';
import headingFocusPlugin from './plugin-heading-focus';

export function getPlugins(schema: Schema, config: EditorConfig) {
	const plugins = [
		inputRulesPlugin(schema),
		...keymapPlugins(schema),

		placeholderPlugin('Start writing...'),
		headingFocusPlugin(),
		marksTooltipPlugin(),
		buttonTooltipPlugin(),
		wordCountPlugin(),

		slashPlugin(config),
		slashTipPlugin(),

		// from defaults
		dropCursor(),
		gapCursor(),

		history(),

		pasteImagesPlugin(),

		nodeMenuPlugin(),
		// completionPlugin(),
	];

	if (schema.nodes.table) {
		plugins.push(
			columnResizing({ cellMinWidth: 20 }),
			tableEditing(),
			tableMenuPlugin(),
		);
	}

	if (config.suggestions && schema.marks.suggestion) {
		plugins.push(suggestionsPlugin(config.suggestions));
	}

	return plugins;
}
