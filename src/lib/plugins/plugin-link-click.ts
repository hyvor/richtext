import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

/**
 * Makes links inside the editor navigable.
 *
 * - Read-only mode: a plain click on a link navigates.
 * - Editing mode: a plain click still places the cursor (so the link text can be
 *   edited); only Cmd/Ctrl + click navigates.
 *
 * Same-page anchor links (`#id`, or a full URL pointing at the current page +
 * hash) smooth-scroll to the matching element inside the editor - never a new
 * tab, even on Cmd/Ctrl + click. Every other link (external or internal) opens
 * in a new tab.
 */

function anchorElementFrom(view: EditorView, event: MouseEvent): HTMLAnchorElement | null {
	const target = event.target as HTMLElement | null;
	const anchor = target?.closest?.('a') ?? null;
	if (!anchor || !view.dom.contains(anchor)) return null;
	return anchor as HTMLAnchorElement;
}

/**
 * Returns the target id when `href` points at an anchor on the current page
 * (`#id`, `?q#id`, or `https://this-page/path#id`), otherwise null.
 */
function samePageAnchorId(href: string): string | null {
	if (href.startsWith('#')) return decodeURIComponent(href.slice(1));

	try {
		const url = new URL(href, window.location.href);
		const here = new URL(window.location.href);
		if (url.origin === here.origin && url.pathname === here.pathname && url.hash) {
			return decodeURIComponent(url.hash.slice(1));
		}
	} catch {
		// not a resolvable URL - treat as a normal link
	}
	return null;
}

function scrollToAnchor(view: EditorView, id: string): void {
	if (!id) return;

	let el: Element | null = null;
	try {
		el = view.dom.querySelector(`#${CSS.escape(id)}`);
	} catch {
		el = null;
	}
	if (!el) el = view.dom.querySelector(`[id="${id.replace(/"/g, '\\"')}"]`);

	el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function linkClickPlugin() {
	return new Plugin({
		props: {
			handleDOMEvents: {
				click(view, event) {
					if (event.button !== 0 || event.shiftKey || event.altKey) return false;

					const anchor = anchorElementFrom(view, event as MouseEvent);
					if (!anchor) return false;

					const href = anchor.getAttribute('href');
					if (!href) return false;

					const modified = event.metaKey || event.ctrlKey;
					// In editing mode a plain click must stay editable; navigate
					// only with the modifier. In read-only mode any click navigates.
					if (view.editable && !modified) return false;

					const anchorId = samePageAnchorId(href);
					if (anchorId !== null) {
						// Always keep anchor navigation in-document - prevent both
						// the native hash jump and the Cmd/Ctrl-click new tab.
						event.preventDefault();
						scrollToAnchor(view, anchorId);
						return true;
					}

					window.open(href, '_blank', 'noopener,noreferrer');
					event.preventDefault();
					return true;
				}
			}
		}
	});
}
