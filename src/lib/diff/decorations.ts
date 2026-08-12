import type { Schema } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { DecorationSet, type EditorView } from 'prosemirror-view';
import { buildDiffDoc } from './render';
import type { Diff } from './types';

export const diffDecorationsKey = new PluginKey<DecorationSet>('diffDecorations');

/**
 * Renders the decorations produced by buildDiffDoc()/renderDiff(). Add this
 * to the (read-only) editor used to display a diff.
 */
export function diffDecorationsPlugin(): Plugin<DecorationSet> {
	return new Plugin({
		key: diffDecorationsKey,
		state: {
			init: () => DecorationSet.empty,
			apply(tr, decorations) {
				const next = tr.getMeta(diffDecorationsKey);
				if (next) return next;
				return tr.docChanged ? decorations.map(tr.mapping, tr.doc) : decorations;
			}
		},
		props: {
			decorations(state) {
				return this.getState(state);
			}
		}
	});
}

/**
 * Replaces the given view's document with the merged diff doc and applies
 * its decorations in one transaction. The view must include
 * diffDecorationsPlugin() and use the same Schema instance the diff was
 * computed with.
 */
export function renderDiff(view: EditorView, diffs: Diff[], schema: Schema): void {
	const { doc, decorations } = buildDiffDoc(diffs, schema);
	const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content);
	tr.setMeta(diffDecorationsKey, DecorationSet.create(tr.doc, decorations));
	view.dispatch(tr);
}
