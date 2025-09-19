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
