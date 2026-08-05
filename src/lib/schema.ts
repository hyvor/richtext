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

    /*  comment: {
         parseDOM: [{tag: "comment"}],
         toDOM() { return ["comment", 0] }
     } as MarkSpec, */

    // Marks inserted/deleted content for diff display (see src/lib/diff).
    // Not meant to be applied by the user - only by diff rendering.
    diff: {
        attrs: {
            diffType: { default: "insert" } // "insert" | "delete" | "format" (marks changed, text didn't)
        },
        parseDOM: [{
            tag: "span[data-diff], div[data-diff]",
            getAttrs(dom: HTMLElement) {
                return { diffType: dom.dataset.diff };
            }
        }],
        toDOM(mark: Mark, inline: boolean) {
            const { diffType } = mark.attrs;
            // block nodes (e.g. an inserted paragraph) can't be wrapped in an
            // inline <span> without producing invalid DOM nesting
            return [inline ? "span" : "div", {
                "data-diff": diffType,
                class: `diff-mark diff-mark-${diffType}`
            }, 0];
        }
    } as MarkSpec,
}

// By default, ProseMirror only allows marks on nodes with inline content -
// block-level children (of doc, blockquote, list items, table cells, ...)
// don't accept marks unless explicitly allowed. The diff mark needs to be
// applicable to whole block nodes too (an inserted/deleted paragraph, image,
// table, ...), so it's explicitly allowed wherever block content is accepted.
function allowDiffMarkOnBlockContent(nodes: ReturnType<typeof addListNodes>) {
    let result = nodes;
    nodes.forEach((name, spec) => {
        const isInlineContent = spec.content !== undefined && /^(inline|text)[*+]?$/.test(spec.content.trim());
        if (spec.content && spec.marks === undefined && !isInlineContent) {
            result = result.update(name, { ...spec, marks: "diff" });
        }
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
        nodes: allowDiffMarkOnBlockContent(addListNodes(schemaWithoutList.spec.nodes, "block+", "block")),
        marks
    });
}