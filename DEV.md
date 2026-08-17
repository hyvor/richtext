# Testing collaboration locally

This repo includes a minimal in-memory WebSocket relay (`dev-server/collab-server.mjs`) for
trying out `editorConfig.collab` (see README.md) without a real server-side authority.

1. Start the relay:

   ```bash
   npm run dev:collab-server
   ```

   Listens on `ws://localhost:8989` (override with `COLLAB_PORT`).

2. Start the app:

   ```bash
   npm run dev
   ```

3. Open the printed URL with `?collab=1` appended (e.g. `http://localhost:5173/?collab=1`)
   in **two tabs of the same browser** - they need to share `localStorage` so both start from
   the same document. Edits in one tab should appear in the other shortly after.

Restart the relay to reset the session, and reload both tabs when you do - it keeps no
persistence, so a client submitting against a version it no longer recognizes is ignored.
