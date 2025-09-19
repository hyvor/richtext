# HYVOR Rich Text Editor

Used in Hyvor Blogs and Hyvor Post.

## Usage

```svelte
import { Editor } from '@hyvor/richtext';


<Editor

    bind:editorView
    content={content}
    onvaluechange={handleValueChange}
    rtl={false}

    config={{
        embedEnabled: false,
        // see config.ts for more options
    }}

/>
```


## Nodes

###  `doc`

- The top-level node representing the entire document.

### `text`

- A text node containing plain text. 
- This is usually the only node that contains marks.
- Group: `inline`

### `paragraph`

- A block-level node representing a paragraph of text.
- Parsed from `<p>` HTML tag.
- Group: `block`
- Content: `inline*`

### `heading`

- A block-level node representing a heading.
- Attributes:
  - `level`: The level of the heading (1-6).
  - `id`: Optional ID for the heading, useful for anchors.
- Parsed from `<h1>`, `<h2>`, `<h3>`, etc. HTML tags.
- Group: `block`
- Content: `inline*`

### `blockquote`

- A block-level node representing a blockquote.
- Parsed from `<blockquote>` HTML tag.
- Group: `block`
- Content: `block+`

### `callout`

- A block-level node representing a callout box.
- Attributes:
  - `emoji`: An emoji to display in the callout. Default `💡`
  - `bg`: Background color of the callout. Default `#f1f1ef`
  - `fg`: Foreground color of the callout. Default `#000000`
- Parsed from `<aside>`

### `figure`

- A block-level node representing a figure, containing an image or audio node along with an optional caption.
- Parsed from `<figure>` HTML tag.
- Group: `block`
- Content: `(image|audio) figcaption`
- `config.imageEnabled` or `config.embedEnabled` must be `true` to enable this node.

### `figcaption`

- An element that represents a caption or legend for a figure.
- Parsed from `<figcaption>` HTML tag.
- Content: `inline*`
- Same conditions as the `figure` node to enable.

### `image`

- A block-level node representing an image, living inside a figure.
- Attributes:
  - `src`: The source URL of the image.
  - `alt`: Alternative text for the image.
  - `width`: Custom width of the image in pixels (`null` by default).
  - `height`: Custom height of the image in pixels (`null` by default).
- Parsed from `<img>` HTML tag.
- `config.imageEnabled` must be `true` to enable this node.

Note: `config.imageUploader` must be provided to upload images.

### `audio`

- A block-level node representing an audio file.
- Attributes:
  - `src`: The source URL of the audio file.
- Parsed from `<audio>` HTML tag.
- `config.audioEnabled` must be `true` to enable this node.

Note: `config.audioUploader` must be provided to upload audio files.

### `embed`

- A block-level node representing an embed, living inside a figure.
- Attributes:
  - `url`: The URL of the embedded content.
- Parsed from `<x-embed>` HTML tag.
- Group: `block`
- `config.embedEnabled` must be `true` to enable this node.

### `bookmark`

- A block-level node representing a link bookmark preview.
- Attributes:
  - `url`: The URL of the bookmark.
- Parsed from `<bookmark>` HTML tag.
- Group: `block`
- `config.bookmarkEnabled` must be `true` to enable this node.

### `toc`

- A block-level node representing a table of contents.
- Attributes:
  - `levels`: The heading levels to include in the TOC (e.g., `[1, 2, 3]`).
- Group: `block`
- `config.tocEnabled` must be `true` to enable this node.

### `table`

- A block-level node representing a table.
- Subnodes: `table_row`, `table_cell`, `table_header`
- Parsed from `<table>` HTML tag.
- Group: `block`
- `config.tableEnabled` must be `true` to enable this node.

### `button`

- A block-level node representing a button.
- Attributes:
  - `href`: The URL the button links to.
- Parsed from `<div class="button-wrap">` HTML tag.
- Group: `block`
- Content: `inline*`
- `config.buttonEnabled` must be `true` to enable this node.


### `code_block`

- A block-level node representing a block of preformatted code.
- Attributes:
  - `language`: The programming language of the code block (optional).
  - `annotations`: An array of annotations for the code block (optional).
  - `name`: Filename associated with the code block (optional).
- Parsed from `<pre><code>` HTML tags.
- Group: `block`
- Content: `text*`

### `custom_html`

- A block-level node representing custom HTML content.
- Attributes:
- Content: `text*`


## Marks

The following marks are supported:

- `code`
- `highlight`
- `link` (attributes: `href`)
- `em`
- `strong`
- `strike`
- `sup`
- `sub`