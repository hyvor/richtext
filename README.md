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