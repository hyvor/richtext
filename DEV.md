# Testing collaboration locally

This repo includes a minimal WebSocket relay (`dev-server/collab-server.mjs`) for trying out
`editorConfig.collab` (see README.md) without a real server-side authority.

1. Start the relay:

   ```bash
   npm run dev:collab-server
   ```

   Listens on `ws://localhost:8989` (override with `COLLAB_PORT`). Its step history persists
   to `dev-server/.collab-history.json`, so restarting it doesn't lose sync with clients that
   already caught up to a later version.

2. Start the app:

   ```bash
   npm run dev
   ```

3. Open the printed URL in **two tabs of the same browser** - they need to share
   `localStorage` so both start from the same document/version. Edits in one tab should
   appear in the other shortly after.

The app persists its `(doc, version)` pair together in `localStorage` on every change, so
reloading a tab resumes correctly instead of resending steps the server already has.

If the two ever get out of sync (e.g. you delete `.collab-history.json` without also
clearing `localStorage`, or vice versa), clear `localStorage` and delete
`dev-server/.collab-history.json` together to reset both back to version 0.
