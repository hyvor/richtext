import {Mark, type MarkSpec, Node, type NodeSpec, Schema} from "prosemirror-model"
import { addListNodes } from "prosemirror-schema-list"
import { tableNodes } from "prosemirror-tables"
import type { Config } from "./config";

// mostly from https://github.com/ProseMirror/prosemirror-schema-basic

function getNodes(config: Config): Record<string, NodeSpec> {

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
            parseDOM: [{tag: "p"}],
            toDOM() { return ['p', 0] }
        },

        heading: {
            attrs: {
                level: {default: 1},
                id: {default: null},
            },
            content: "inline*",
            group: "block",
            defining: true,
            draggable: false,
            selectable: false,
            parseDOM: [
                {tag: "h1", getAttrs(h: HTMLElement) {return {id: h.id, level: 1}}},
                {tag: "h2", getAttrs(h: HTMLElement) {return {id: h.id, level: 2}}},
                {tag: "h3", getAttrs(h: HTMLElement) {return {id: h.id, level: 3}}},
                {tag: "h4", getAttrs(h: HTMLElement) {return {id: h.id, level: 4}}},
                {tag: "h5", getAttrs(h: HTMLElement) {return {id: h.id, level: 5}}},
                {tag: "h6", getAttrs(h: HTMLElement) {return {id: h.id, level: 6}}}
            ],
            toDOM(node: Node) { return ["h" + node.attrs.level, {id: node.attrs.id}, 0] }
        },

        blockquote: {
            content: "block+",
            group: "block",
            defining: true,
            selectable: false,
            parseDOM: [{tag: "blockquote"}],
            toDOM() { return ["blockquote", 0] }
        },

        callout: {
            attrs: {
                emoji: {default: "💡"},
                bg: {default: "#f1f1ef"},
                fg: {default: "#000000"}
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
            toDOM(node: Node) { return ["aside", {
                'data-emoji': node.attrs.emoji,
                style: `background-color: ${node.attrs.bg}; color: ${node.attrs.fg}`
            }, 0] }
        },

        // required for image and embed
        figure: {
            content: config.embedEnabled ? "(image|embed) figcaption" : "image figcaption",
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
        },

        figcaption: {
            content: "inline*",
            //group: "figure",
            selectable: false,
            parseDOM: [{tag: "figcaption"}],
            toDOM() { return ["figcaption", 0]; },
        },

        image: {
            attrs: {
                src: {default: null},
                alt: {default: null},
                width: {default: null},
                height: {default: null}
            },
            inline: false,
            draggable: false,
            selectable: false,
            //group: "figure",
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
            return ["img", {...node.attrs}]; 
            }
        },

        horizontal_rule: {
            group: "block",
            parseDOM: [{tag: "hr"}],
            toDOM() { return ['hr'] }
        },

        hard_break: {
            inline: true,
            group: "inline",
            selectable: false,
            parseDOM: [{tag: "br"}],
            toDOM() { return ['br'] }
        }
    };

    if (config.codeBlockEnabled) {
        nodes.code_block = {
            attrs: {
                language: {default: null},
                annotations: {default: null},
                name: {default: null},
            },
            content: "text*",
            marks: "",
            group: "block",
            code: true,
            defining: true,
            selectable: false,
            parseDOM: [{tag: "pre", preserveWhitespace: "full"}],
            toDOM() { return ["pre", ["code", 0]] }
        }
    }

    if (config.customHtmlEnabled) {
        nodes.custom_html = {
            content: "text*",
            marks: "",
            group: "block",
            code: true,
            defining: true,
            selectable: false,
            parseDOM: [{tag: "custom", preserveWhitespace: "full"}],
            toDOM() { return ["custom", 0] }
        }
    }

    if (config.audioEnabled) {
        nodes.audio = {
            attrs: {
                src: {default: null}
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
            return ["audio", {...node.attrs}]; 
            }
        }
    }

    if (config.embedEnabled) {
        nodes.embed = {
            attrs: {
                url: {default: null}
            },
            // content: "text*",
            //group: "block",
            // atom: true,
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

    if (config.bookmarkEnabled) {
        nodes.bookmark = {
            attrs: {
                url: {default: null}
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

    if (config.tocEnabled) {
        nodes.toc = {
            attrs: { 
                levels: {default: [1,2,3,4,5,6]} 
            },
            group: "block",
            inline: false,
            draggable: true,
            selectable: true,
            atom: true,
        }
    }

    if (config.tableEnabled) {
        const tableNodess = tableNodes({
            tableGroup: "block",
            cellContent: "block+",
            cellAttributes: {}
        });
        Object.assign(nodes, tableNodess);
    }

    if (config.buttonEnabled) {
        nodes.button = {
            attrs: {
                href: {default: null},
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
        parseDOM: [{tag: "code"}],
        toDOM() { return ["code", 0] }
    } as MarkSpec,

    highlight: {
        parseDOM: [{tag: "mark"}],
        toDOM() { return ["mark", 0] }
    } as MarkSpec,

    // :: MarkSpec A link. Has `href` and `title` attributes. `title`
    // defaults to the empty string. Rendered and parsed as an `<a>`
    // element.
    link: {
        attrs: {
            href: {},
        },
        inclusive: false,
        parseDOM: [{tag: "a[href]", getAttrs(dom: HTMLElement) {
            return {
                href: dom.getAttribute("href")
            }
        }}],
        toDOM(mark: Mark) { let {href} = mark.attrs; return ["a", {href}, 0] }
    } as MarkSpec,

    // :: MarkSpec An emphasis mark. Rendered as an `<em>` element.
    // Has parse rules that also match `<i>` and `font-style: italic`.
    em: {
        parseDOM: [{tag: "i"}, {tag: "em"}, {style: "font-style=italic"}],
        toDOM() { return ["em", 0] }
    } as MarkSpec,

    // :: MarkSpec A strong mark. Rendered as `<strong>`, parse rules
    // also match `<b>` and `font-weight: bold`.
    strong: {
        parseDOM: [
            {tag: "strong"},
            // This works around a Google Docs misbehavior where
            // pasted content will be inexplicably wrapped in `<b>`
            // tags with a font-weight normal.
            {tag: "b", getAttrs: (node: HTMLElement) => node.style.fontWeight != "normal" && null},
            {style: "font-weight", getAttrs: (value: string) => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null}
        ],
        toDOM() { return ["strong", 0] }
    } as MarkSpec,


    // `<s>` for strike
    strike: {
        parseDOM: [{tag: "s"}, {tag: "strike"}, {tag: "del"}],
        toDOM() { return ["s", 0] }
    } as MarkSpec,

    sup: {
        parseDOM: [{tag: "sup"}],
        toDOM() { return ["sup", 0] }
    } as MarkSpec,

    sub: {
        parseDOM: [{tag: "sub"}],
        toDOM() { return ["sub", 0] }
    } as MarkSpec,

   /*  comment: {
        parseDOM: [{tag: "comment"}],
        toDOM() { return ["comment", 0] }
    } as MarkSpec, */
}

export function getSchema(config: Config): Schema {

    const schemaWithoutList = new Schema({
        nodes: getNodes(config), 
        marks
    });

    return new Schema({
        nodes: addListNodes(schemaWithoutList.spec.nodes, "block+", "block"),
        marks
    });
}