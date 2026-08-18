# Testing collaboration locally

This repo includes a minimal WebSocket server (`dev-server/collab-server.mjs`) for trying out
`editorConfig.collab` and `editorConfig.cursors` (see README.md) without a real server-side
authority. It's a central store, not just a relay - it holds the current document itself, so
any tab/browser/machine that connects gets the same document instead of needing to share
`localStorage` with an already-caught-up tab.

1. Start the server:

   ```bash
   npm run dev:collab-server
   ```

   Listens on `ws://localhost:8989` (override with `COLLAB_PORT`). The document and its
   collab version persist to `dev-server/.collab-store.json`, so restarting it doesn't lose
   the document. Cursor presence is not persisted - it's cleared for a tab as soon as it
   disconnects.

2. Start the app:

   ```bash
   npm run dev
   ```

3. Open the printed URL in as many tabs/browsers/machines as you like - each one fetches the
   current document from the server on connect, so they don't need to share anything locally.
   Edits in one tab should appear in the others shortly after, and moving the
   cursor/selection in one tab should show up (with a name tooltip on hover) in the others.

Each tab gets a random name (`User XXXX`) and color for its cursor, generated once on load -
see `collabUser` in `app/App.svelte`.

The app sends its document to the server on every change (see `saveDoc` in `app/App.svelte`),
so the server always has the latest version once a tab has it - delete
`dev-server/.collab-store.json` to reset back to an empty document at version 0.

If the collab server isn't running, the app falls back to a plain local editor (no
collaboration, no persistence) rather than failing to load.
