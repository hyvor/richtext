# HYVOR Rich Text Editor

Used in Hyvor Blogs and Hyvor Post.

## Usage

```svelte
<script lang="ts">
  import { Editor, getSchema } from '@hyvor/richtext';

  // get the schema, which you can share across multiple editors
  const schema = getSchema({
    codeBlock: true,
    customHtml: true,
    embed: true,
    image: false,
    audio: false,
    bookmark: true,
    toc: true,
    table: true,
    button: true,
  });
</script>


<Editor

    bind:editorView
    content={content}
    schema={schema}
    onvaluechange={handleValueChange}
    rtl={false}

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
<!-- - `highlight` -->
- `link` (attributes: `href`)
- `em`
- `strong`
- `strike`
- `sup`
- `sub`
- `suggestion` (attributes: `type`, `id`, `add`, `remove`) - see [Suggestions & Comments](#suggestions--comments) below. Not meant to be toggled directly; use the suggestions plugin's commands instead.


## Suggestions & Comments

Track-changes (suggested insertions/deletions/formatting) and comment threads share one
mark (`suggestion`) and one node attribute (`suggestions`), so they're set up together via
a single plugin.

```svelte
<script lang="ts">
  import { Editor, getSchema, suggestionsPlugin, type Author, type AuthorInfo } from '@hyvor/richtext';

  const schema = getSchema();
  const currentAuthor: Author = 'user:42'; // or 'ai'

  const plugin = suggestionsPlugin({
    author: currentAuthor,
    mode: 'suggesting', // 'editing' (default) | 'suggesting'
    resolveAuthor,
    source,
  });
</script>

<Editor {schema} plugins={[plugin]} ... />
```

### Attribution: `author` and `resolveAuthor`

- `author` is the id of whoever is currently editing (`` `user:${string}` `` or `"ai"`), attached to
  every suggestion/comment this session creates.
- `resolveAuthor(author)` turns an `Author` id into `{ name, picture? }` for display in the
  floating review panel. May be async (e.g. a network/directory lookup).

### `source`: where authorship and comment content actually live

**Author identity and comment/reply content are never stored in the document itself** -
only a mark/node-attr `id` is. This is deliberate: the document is fully client-editable
content, so embedding `author` in it would let anyone claim any author by hand-editing the
saved JSON. Instead, `source` is a host-supplied backing store the plugin reads/writes by
`id` - the same "editor only holds a reference, host owns the real data" pattern as
`editorConfig.fileUploader`. Real authorship enforcement (e.g. stamping the authenticated
user server-side, rather than trusting whatever a client passes into `create`/`reply`) is
the host's responsibility, not the editor's.

```ts
import type { SuggestionSource } from '@hyvor/richtext';

const source: SuggestionSource = {
  // Called in batches whenever the editor encounters ids it hasn't seen yet
  // (e.g. right after loading a document). Return null for an id your
  // backend has no record of - it will not be retried.
  async get(ids) {
    const rows = await api.getSuggestions(ids);
    return Object.fromEntries(ids.map((id) => [id, rows[id] ?? null]));
  },

  // Fire-and-forget notifications - called once per event, after the
  // causing change has already been applied locally.
  create(id, type, author) {
    api.createSuggestion({ id, type, author });
  },
  reply(id, reply) {
    api.addReply(id, reply); // reply: { id, author, content, timestamp }
  },
  resolve(id, decision) {
    // decision: "accept" | "reject" | "resolve"
    api.resolveSuggestion(id, decision);
  },
};
```

`get`/`create`/`reply` are required; `resolve` is optional (skip it if you don't need to
clean up resolved/accepted/rejected records host-side).

### Commands (from `@hyvor/richtext`)

- `getSuggestions(state)` - list all pending suggestions/comments (`{id, type, author,
  from, to, comments, ...}`); `author`/`comments` are `null`/`[]` until `source.get`
  resolves them.
- `acceptSuggestion(view, id)` / `rejectSuggestion(view, id)` - resolve a single
  insert/delete/format suggestion.
- `acceptAllSuggestions(view)` / `rejectAllSuggestions(view)` - bulk variants (skip
  comment-type entries).
- `addComment(view, text)` - attach a new comment thread to the current selection.
- `replyToSuggestion(view, id, text)` - reply to any thread (a comment, or a live
  suggestion) - this never touches the document, only `source`.
- `resolveComment(view, id)` - close a comment thread.
- `setSuggestionMode(view, mode)` / `getSuggestionMode(state)` - toggle `'editing'` vs
  `'suggesting'`; while suggesting, edits are recorded as suggestions instead of applied
  directly.
- `setCurrentAuthor(view, author)` / `getCurrentAuthor(state)`.
- `seedSuggestionSource(view, entries)` - pre-populate the plugin's local cache with
  already-known `{id, type, author}` triples without waiting on `source.get()` - useful
  for suggestions your app generates itself (e.g. `buildDiffDoc`'s output, see below)
  rather than ones the user typed.

### Diff view

`buildDiffDoc(diffs, schema)` (from `diffDoc`'s output) builds a suggestion-annotated
document from a two-document diff, for a track-changes-style merged view. It returns
`{ doc, suggestions }` - `suggestions` is the list of generated `{id, type}` pairs, which
have no author of their own (a diff has no per-change authorship) and must be attributed
by the caller, typically via `seedSuggestionSource` or by writing directly into your
`source`'s backing store.


## Collaboration

Real-time collaborative editing is built on [`prosemirror-collab`](https://prosemirror.net/docs/ref/#collab).
The editor never talks to a server itself - the host provides a transport via
`editorConfig.collab` and feeds remote steps back in via `editor.collab.receiveSteps()`.
Server-side implementation (assigning versions, rebroadcasting steps to other clients,
persisting the document) is entirely up to the host app.

```svelte
<script lang="ts">
  import { Editor, getSchema } from '@hyvor/richtext';

  const schema = getSchema();
  let editor: Editor;
</script>

<Editor
  {schema}
  editorConfig={{
    collab: {
      version: 0, // the version this initial doc corresponds to
      clientID: currentUserId, // optional, random by default
      onSendable(sendable) {
        // sendable: { version, steps, clientID } - send it to your server
        connection.send(sendable);
      },
    },
  }}
  bind:this={editor}
/>
```

Whenever your transport receives a batch of steps from the server (including batches made
up of this client's own steps being confirmed), pass them to:

```ts
editor.collab.receiveSteps(steps, clientIDs);
```

`editor.collab.getVersion()` returns the editor's current collab version.

See `DEV.md` for a minimal local WebSocket relay used to try this out during development.

### Cursors (other users' selections)

Shows other users' cursors/selections as a colored caret + tinted selection, with a name
tooltip on hovering the caret. Same split as collaboration: the editor never talks to a
server - the host provides `editorConfig.cursors` and feeds remote cursors in via
`editor.cursors.set()`.

```svelte
<script lang="ts">
  import { Editor, getSchema, type RemoteCursor } from '@hyvor/richtext';

  const schema = getSchema();
  let editor: Editor;
</script>

<Editor
  {schema}
  editorConfig={{
    cursors: {
      debounceMs: 250, // default
      onLocalCursorChange(cursor) {
        // cursor: { from, to } | null (null on blur) - send it to your server
        connection.send(cursor);
      },
    },
  }}
  bind:this={editor}
/>
```

Whenever your transport tells you about other users' cursors, pass the full current list to:

```ts
editor.cursors.set(cursors); // RemoteCursor[]: { clientId, from, to, user: { name, color, picture? } }
```

`clientId` identifies which user a given entry belongs to across updates - reusing
`editorConfig.collab`'s `clientID` is the natural choice if you're running both together.
`user.color` is any CSS color, used for the caret, tooltip, and (tinted) selection
highlight.

See `DEV.md` for how the local WebSocket relay also relays cursor presence.