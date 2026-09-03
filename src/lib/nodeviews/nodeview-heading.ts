import type { Node as ProsemirrorNode } from 'prosemirror-model';
import { EditorView, type NodeView } from 'prosemirror-view';
import { setNodeAttrs } from '../plugins/suggestions/commands';

export default class HeadingNodeView implements NodeView {

	dom: HTMLElement;
	contentDOM: HTMLElement;

	private selection: any;
	private input?: HTMLInputElement;
	private inputWrap?: HTMLDivElement;
	private headingDetails?: HTMLDivElement;
	private compactLabel?: HTMLDivElement;

	private node: ProsemirrorNode;

	constructor(node: ProsemirrorNode, view: EditorView, getPos: () => number | undefined) {

		this.node = node;

		this.dom = document.createElement('div');
		this.dom.classList.add('heading-wrap');

		// Create contentDOM up front so read-only mode can return early with
		// just the rendered heading and the level/id label (no editing chrome).
		this.contentDOM = document.createElement('h' + this.node.attrs.level);
		this.contentDOM.id = this.node.attrs.id || '';

		// The compact label shown in
		// both modes; the details bar below (level switcher + id input) is
		// editing-only.
		this.compactLabel = document.createElement('div');
		this.compactLabel.classList.add('heading-compact');
		this.compactLabel.contentEditable = 'false';

		if (!view.editable) {
			this.dom.appendChild(this.compactLabel);
			this.dom.appendChild(this.contentDOM);
			this.updateCompactLabel();
			return;
		}

		const headingDetails = document.createElement('div');
		headingDetails.classList.add('heading-details');
		headingDetails.contentEditable = 'false';
		this.headingDetails = headingDetails;

		// Create headingSelectorsWrap before inputWrap
		const headingSelectorsWrap = document.createElement('div');
		headingSelectorsWrap.classList.add('heading-selectors-wrap');
		[1, 2, 3, 4, 5, 6].map((level) => {
			const selector = document.createElement('button');
			selector.type = 'button';
			selector.classList.add('heading-selector');
			selector.textContent = 'H' + level;
			selector.addEventListener('mouseover', () => {
				this.selection = view.state.tr.selection;
			});
			selector.addEventListener('click', () => {
				const pos = getPos();
				if (pos === undefined) return;

				setNodeAttrs(view, pos, { ...this.node.attrs, level });

				// Restore selection
				const posInNode = this.selection.from;
				let mappedPos = view.state.tr.mapping.map(posInNode);
				const newSelection = this.selection.constructor.create(view.state.tr.doc, mappedPos);
				view.dispatch(view.state.tr.setSelection(newSelection));
				view.focus();
			});

			if (node.attrs.level === level) {
				selector.classList.add('selected');
			}

			headingSelectorsWrap.appendChild(selector);
			return selector;
		});
		headingDetails.appendChild(headingSelectorsWrap);

		// Create inputWrap for the input field
		this.inputWrap = document.createElement("div");
		this.inputWrap.classList.add("input-wrap");
		headingDetails.appendChild(this.inputWrap);
		this.dom.appendChild(headingDetails);

		// Compact label, shown by default; the details bar above is only
		// shown while the cursor is inside this heading (see
		// plugin-heading-focus.ts / .heading-focused in Editor.svelte)
		this.dom.appendChild(this.compactLabel);

		const id = this.node.attrs.id || "";
		this.dom.appendChild(this.contentDOM);

		const type = document.createElement("span");
		type.innerHTML = "#";
		this.inputWrap.appendChild(type);

		// ID input
		this.input = document.createElement("input");
		this.input.value = id;

		this.input.oninput = (e) => {
			const pos = getPos();

			if (pos === undefined)
				return;

			setNodeAttrs(view, pos, { ...this.node.attrs, id: (e.target as HTMLInputElement).value });
		};

		this.inputWrap.appendChild(this.input);

		this.updateCompactLabel();
	}

    update(node: ProsemirrorNode) {

		if (node.type.name !== 'heading') {
			return false;
		}

		this.node = node;

        if (Number(node.attrs.level) === Number(this.contentDOM.tagName[1])) {
            // changing ID

			this.contentDOM.id = node.attrs.id;
            if (this.input) this.input.value = node.attrs.id;
            this.updateCompactLabel();
            return true;
        }

        return false;
    }

	private updateCompactLabel() {
		if (!this.compactLabel) return;
		const { level, id } = this.node.attrs;
		this.compactLabel.textContent = `H${level}` + (id ? ` #${id}` : '');
	}

	stopEvent(e: Event) {
		return !!this.headingDetails && this.headingDetails.contains(e.target as Node);
	}
}