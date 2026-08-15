import { Mark, type MarkSpec, Node, type NodeSpec, Schema } from "prosemirror-model"
import { addListNodes } from "prosemirror-schema-list"
import { tableNodes } from "prosemirror-tables"
import { defaultSchemaConfig,  type SchemaConfig } from "./config";

// mostly from https://github.com/ProseMirror/prosemirror-schema-basic
function getNodes(config: SchemaConfig): Record<string, NodeSpec> {

    const nodes: Record<string, NodeSpec> = {

        doc: {
            content: "block+"
        },

        text: {
            group: "inline"
        },

        paragraph: {
            content: "inline*",
            group: "block",
            selectable: false,
            draggable: true,
            parseDOM: [{ tag: "p" }],
            toDOM() { return ['p', 0] }
        },

        heading: {
            attrs: {
                level: { default: 1 },
                id: { default: null },
            },
            content: "inline*",
            group: "block",
            defining: true,
            draggable: false,
            selectable: false,
            parseDOM: [
                { tag: "h1", getAttrs(h: HTMLElement) { return { id: h.id, level: 1 } } },
                { tag: "h2", getAttrs(h: HTMLElement) { return { id: h.id, level: 2 } } },
                { tag: "h3", getAttrs(h: HTMLElement) { return { id: h.id, level: 3 } } },
                { tag: "h4", getAttrs(h: HTMLElement) { return { id: h.id, level: 4 } } },
                { tag: "h5", getAttrs(h: HTMLElement) { return { id: h.id, level: 5 } } },
                { tag: "h6", getAttrs(h: HTMLElement) { return { id: h.id, level: 6 } } }
            ],
            toDOM(node: Node) { return ["h" + node.attrs.level, { id: node.attrs.id }, 0] }
        },

        blockquote: {
            content: "block+",
            group: "block",
            defining: true,
            selectable: false,
            parseDOM: [{ tag: "blockquote" }],
            toDOM() { return ["blockquote", 0] }
        },

        callout: {
            attrs: {
                emoji: { default: "💡" },
                bg: { default: "#f1f1ef" },
                fg: { default: "#000000" }
            },
            content: "inline*",
            group: "block",
            defining: true,
            selectable: false,
            parseDOM: [{
                tag: "aside",
                getAttrs(aside: HTMLElement) {
                    return {
                        emoji: aside.dataset.emoji,
                        bg: aside.style.backgroundColor,
                        fg: aside.style.color
                    }
                }
            }],
            toDOM(node: Node) {
                return ["aside", {
                    'data-emoji': node.attrs.emoji,
                    style: `background-color: ${node.attrs.bg}; color: ${node.attrs.fg}`
                }, 0]
            }
        },

        horizontal_rule: {
            group: "block",
            parseDOM: [{ tag: "hr" }],
            toDOM() { return ['hr'] }
        },

        hard_break: {
            inline: true,
            group: "inline",
            selectable: false,
            // hard_break has no inline *content*, so ProseMirror doesn't allow it to
            // carry marks by default - grant the suggestion mark explicitly so a
            // line break can be part of a tracked insert/delete/format run, or a
            // comment thread (see src/lib/plugins/suggestions and src/lib/diff).
            marks: "suggestion",
            parseDOM: [{ tag: "br" }],
            toDOM() { return ['br'] }
        }
    };

    if (config.codeBlock) {
        nodes.code_block = {
            attrs: {
                language: { default: null },
                annotations: { default: null },
                name: { default: null },
            },
            content: "text*",
            marks: "",
            group: "block",
            code: true,
            defining: true,
            selectable: false,
            parseDOM: [{ tag: "pre", preserveWhitespace: "full" }],
            toDOM() { return ["pre", ["code", 0]] }
        }
    }

    if (config.customHtml) {
        nodes.custom_html = {
            content: "text*",
            marks: "",
            group: "block",
            code: true,
            defining: true,
            selectable: false,
            parseDOM: [{ tag: "custom", preserveWhitespace: "full" }],
            toDOM() { return ["custom", 0] }
        }
    }

    const imageEnabled = config.image;
    const embedEnabled = config.embed;

    if (imageEnabled || embedEnabled) {

        nodes.figure = {
            content:
                embedEnabled && imageEnabled ? "(image|embed) figcaption" :
                    (embedEnabled ? "embed figcaption" : "image figcaption"),
            group: "block",
            selectable: false,
            draggable: true,
            parseDOM: [
                {
                    tag: "figure",
                }
            ],
            toDOM() {
                return ["figure", 0]
            }
        };

        nodes.figcaption = {
            content: "inline*",
            selectable: false,
            parseDOM: [{ tag: "figcaption" }],
            toDOM() { return ["figcaption", 0]; },
        };

        if (imageEnabled) {
            nodes.image = {
                attrs: {
                    src: { default: null },
                    alt: { default: null },
                    width: { default: null },
                    height: { default: null }
                },
                inline: false,
                draggable: false,
                selectable: false,
                parseDOM: [{
                    tag: "img[src]",
                    getAttrs(img: HTMLElement) {
                        return {
                            src: img.getAttribute("src"),
                            alt: img.getAttribute("alt"),
                            width: img.getAttribute("width"),
                            height: img.getAttribute("height")
                        };
                    }
                }],
                toDOM(node: Node) {
                    return ["img", { ...node.attrs }];
                }
            };
        }

        if (embedEnabled) {
            nodes.embed = {
                attrs: {
                    url: { default: null }
                },
                selectable: true,
                draggable: false,
                parseDOM: [{
                    tag: "x-embed[data-url]",
                    getAttrs(div: HTMLElement) {
                        return {
                            url: div.dataset.url
                        }
                    }
                }],
                toDOM(node: Node) {
                    return ["x-embed", {
                        "data-url": node.attrs.url
                    }]
                }
            }
        }

    }

    if (config.audio) {
        nodes.audio = {
            attrs: {
                src: { default: null }
            },
            inline: false,
            selectable: false,
            group: "block",
            atom: true,
            parseDOM: [{
                tag: "audio[src]",
                getAttrs(audio: HTMLElement) {
                    return {
                        src: audio.getAttribute("src"),
                    };
                }
            }],
            toDOM(node: Node) {
                return ["audio", { ...node.attrs }];
            }
        }
    }

    if (config.bookmark) {
        nodes.bookmark = {
            attrs: {
                url: { default: null }
            },
            //atom: true,
            //draggable: true,
            selectable: true,
            group: "block",
            parseDOM: [{
                tag: "bookmark[data-url]",
                getAttrs(div: HTMLElement) {
                    return {
                        url: div.dataset.url
                    }
                }
            }],
            toDOM(node: Node) {
                return ["bookmark", {
                    "data-url": node.attrs.url
                }]
            }
        }
    }

    if (config.toc) {
        nodes.toc = {
            attrs: {
                levels: { default: [1, 2, 3, 4, 5, 6] }
            },
            group: "block",
            inline: false,
            draggable: true,
            selectable: true,
            atom: true,
        }
    }

    if (config.table) {
        const tableNodess = tableNodes({
            tableGroup: "block",
            cellContent: "block+",
            cellAttributes: {}
        });
        Object.assign(nodes, tableNodess);
    }

    if (config.button) {
        nodes.button = {
            attrs: {
                href: { default: null },
            },
            content: "inline*",
            group: 'block',
            draggable: false,
            selectable: false,
            parseDOM: [
                {
                    tag: 'div.button-wrap a[href]',
                    getAttrs(dom: HTMLElement) {
                        return {
                            href: dom.getAttribute('href'),
                        };
                    }
                }
            ],
            toDOM(node) {
                const { href } = node.attrs;
                return [
                    'div',
                    { class: 'button-wrap' },
                    [
                        'a',
                        { href, class: 'button', target: '_blank' },
                        0
                    ]
                ];
            }
        }
    }


    return nodes;

}

// :: Object [Specs](#model.MarkSpec) for the marks in the schema.
/**
 * Marks with background color should come first https://discuss.prosemirror.net/t/marks-priority/4463
 */
export const marks = {

    // :: MarkSpec Code font mark. Represented as a `<code>` element.
    code: {
        parseDOM: [{ tag: "code" }],
        toDOM() { return ["code", 0] }
    } as MarkSpec,

    // highlight: {
    //     parseDOM: [{ tag: "mark" }],
    //     toDOM() { return ["mark", 0] }
    // } as MarkSpec,

    // :: MarkSpec A link. Has `href` and `title` attributes. `title`
    // defaults to the empty string. Rendered and parsed as an `<a>`
    // element.
    link: {
        attrs: {
            href: {},
        },
        inclusive: false,
        parseDOM: [{
            tag: "a[href]", getAttrs(dom: HTMLElement) {
                return {
                    href: dom.getAttribute("href")
                }
            }
        }],
        toDOM(mark: Mark) { let { href } = mark.attrs; return ["a", { href }, 0] }
    } as MarkSpec,

    // :: MarkSpec An emphasis mark. Rendered as an `<em>` element.
    // Has parse rules that also match `<i>` and `font-style: italic`.
    em: {
        parseDOM: [{ tag: "i" }, { tag: "em" }, { style: "font-style=italic" }],
        toDOM() { return ["em", 0] }
    } as MarkSpec,

    // :: MarkSpec A strong mark. Rendered as `<strong>`, parse rules
    // also match `<b>` and `font-weight: bold`.
    strong: {
        parseDOM: [
            { tag: "strong" },
            // This works around a Google Docs misbehavior where
            // pasted content will be inexplicably wrapped in `<b>`
            // tags with a font-weight normal.
            { tag: "b", getAttrs: (node: HTMLElement) => node.style.fontWeight != "normal" && null },
            { style: "font-weight", getAttrs: (value: string) => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null }
        ],
        toDOM() { return ["strong", 0] }
    } as MarkSpec,


    // `<s>` for strike
    strike: {
        parseDOM: [{ tag: "s" }, { tag: "strike" }, { tag: "del" }],
        toDOM() { return ["s", 0] }
    } as MarkSpec,

    sup: {
        parseDOM: [{ tag: "sup" }],
        toDOM() { return ["sup", 0] }
    } as MarkSpec,

    sub: {
        parseDOM: [{ tag: "sub" }],
        toDOM() { return ["sub", 0] }
    } as MarkSpec,

    // :: MarkSpec Wraps inline content that carries a pending suggestion or a
    // comment thread - track-changes and comments share this one mark type.
    // `type` picks which of the four this instance represents:
    //   - "insert"/"delete": inserted/"deleted" text while in suggesting mode
    //     (deleted text is kept in place, struck through, until
    //     accepted/rejected)
    //   - "format": a run whose formatting (marks) changed while suggesting;
    //     `add` holds the mark type names that were added, `remove` holds the
    //     {type, attrs} of marks that were removed, so the change can be
    //     reverted if rejected
    //   - "comment": a plain comment thread over this range, not a proposed
    //     edit - never produced by editing, only by explicit "Comment"
    //     actions (see commands.ts's addComment)
    // `author` identifies who made the suggestion/comment (e.g. "user:42" or
    // "ai") - display name/picture resolution is left to the host app (see
    // AuthorInfo/resolveAuthor in plugin-suggestions.ts), so only the raw
    // identifier round-trips through the document. `comments` is a reply
    // thread attached to this instance - available on every subtype, not
    // just "comment", so a live suggestion can be discussed too.
    // insert/delete/format are produced by the suggestions plugin and the
    // diff renderer (src/lib/plugins/suggestions, src/lib/diff); "comment" is
    // produced by commands.ts's addComment, triggered from the marks-tooltip
    // and node-menu "Comment" actions. No parseDOM on purpose: pasting HTML
    // from elsewhere shouldn't silently attach content to an existing
    // suggestion/thread just because it happens to carry the same data
    // attribute. `excludes: ""` lets multiple instances (any subtype/id)
    // stack on the same range - e.g. two comment threads on the same word, or
    // a comment alongside a pending suggestion.
    suggestion: {
        attrs: {
            type: { default: "insert" },
            id: { default: "" },
            author: { default: "" },
            comments: { default: [] },
            add: { default: [] },
            remove: { default: [] },
        },
        inclusive: false,
        excludes: "",
        toDOM(mark: Mark) {
            const { type, id } = mark.attrs;
            if (type === "insert") {
                return ["ins", {
                    class: "suggestion-insert",
                    "data-suggestion-id": id,
                    title: "Suggested insertion"
                }, 0];
            }
            if (type === "delete") {
                return ["del", {
                    class: "suggestion-delete",
                    "data-suggestion-id": id,
                    title: "Suggested deletion"
                }, 0];
            }
            if (type === "format") {
                return ["span", {
                    class: "suggestion-format",
                    "data-suggestion-id": id,
                    title: "Suggested formatting"
                }, 0];
            }
            return ["span", {
                class: "user-comment",
                "data-suggestion-id": id,
            }, 0];
        }
    } as MarkSpec,
}

// The suggestion mark above only applies to inline content (by default,
// ProseMirror doesn't allow marks on nodes with block content, and leaf/atom
// nodes like image have no content to carry a mark's range at all). So a
// whole non-inline node that itself carries a pending suggestion or comment
// thread - an inserted/deleted blockquote, an image whose src changed, a
// table someone commented on, ... - can't be wrapped in the mark. Instead
// every node except doc/text gets a `suggestions` attr: a list of
// {type, id, author, comments} objects (plus, for type "format", a snapshot
// of the node's previous attrs so a reject can restore them), one per
// pending whole-node suggestion/comment on that node - independent of any
// suggestion marks its own inline content may carry. It's a list (not a
// single object) because while a node never has more than one pending
// insert/delete/format at a time, it can reasonably have several independent
// comment threads attached to it at once; that business rule (at most one
// non-comment entry) is enforced by the mutating code, not the schema. Reset
// to null (not an empty array) when the last entry is removed. This
// round-trips through JSON like any other attribute. See
// src/lib/plugins/suggestions and src/lib/diff.
function withSuggestionAttrs(nodes: ReturnType<typeof addListNodes>): ReturnType<typeof addListNodes> {
    let result = nodes;
    nodes.forEach((name, spec) => {
        if (name === "doc" || name === "text") return;
        result = result.update(name, {
            ...spec,
            attrs: {
                ...(spec.attrs ?? {}),
                suggestions: { default: null },
            }
        });
    });
    return result;
}

export function getSchema(config?: Partial<SchemaConfig>): Schema {

    const mergedConfig: SchemaConfig = Object.assign({}, defaultSchemaConfig, config);

    const schemaWithoutList = new Schema({
        nodes: getNodes(mergedConfig),
        marks
    });

    return new Schema({
        nodes: withSuggestionAttrs(addListNodes(schemaWithoutList.spec.nodes, "block+", "block")),
        marks
    });
}