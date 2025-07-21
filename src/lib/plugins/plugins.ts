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
import type { Config } from '../config';
// import nodeMenuPlugin from './nodeMenu/plugin-nodemenu.svelte.js';
// import { completionPlugin } from './completion/plugin-completion';

export function getPlugins(schema: Schema, config: Config) {
	const plugins = [
		inputRulesPlugin(schema),
		...keymapPlugins(schema),

		placeholderPlugin('Start writing...'),
		marksTooltipPlugin(),
		wordCountPlugin(),

		slashPlugin(config),
		slashTipPlugin(),

		// from defaults
		dropCursor(),
		gapCursor(),

		history(),

		pasteImagesPlugin(),

		// https://github.com/curvenote/prosemirror-codemark
		// ...codemark({ markType: schema.marks.code }),


		// nodeMenuPlugin(),
		// completionPlugin(),
	];

	if (config.tableEnabled) {
		plugins.push(
			columnResizing({ cellMinWidth: 20 }),
			tableEditing(),
			tableMenuPlugin(),
		);
	}

	return plugins;
}
