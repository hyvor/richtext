import type { Node } from 'prosemirror-model';

export interface CmTextMarker {
	clear(): void;
}

export function renderCodeSuggestions(cm: any, node: Node, previous: CmTextMarker[]): CmTextMarker[] {
	for (const marker of previous) marker.clear();

	const markers: CmTextMarker[] = [];
	node.forEach((child, offset) => {
		if (!child.isText) return;
		const suggestion = child.marks.find((m) => m.type.name === 'suggestion');
		if (!suggestion) return;

		const type = suggestion.attrs.type as string;
		const className =
			type === 'delete'
				? 'cm-suggestion cm-suggestion-delete'
				: type === 'insert'
					? 'cm-suggestion cm-suggestion-insert'
					: type === 'comment'
						? 'cm-suggestion cm-suggestion-comment'
						: null;
		if (!className) return;

		markers.push(
			cm.markText(cm.posFromIndex(offset), cm.posFromIndex(offset + child.nodeSize), {
				className,
				inclusiveLeft: false,
				inclusiveRight: false
			})
		);
	});
	return markers;
}
