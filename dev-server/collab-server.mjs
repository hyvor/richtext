// Minimal local WebSocket server for exercising editorConfig.collab and
// editorConfig.cursors during development - see DEV.md. This is NOT the
// "server-side implementation" referenced by CollabPluginConfig; a real host
// is expected to build its own authority (with auth, persistence, multiple
// documents, etc). This one acts as a single shared "document" for whatever
// browser tabs/windows connect to it - relaying prosemirror-collab steps and
// cursor presence, and storing the current (doc, version) itself so a fresh
// client (no localStorage involved at all) can bootstrap straight from here
// instead of needing to share a browser profile with an already-caught-up
// tab. Persisted to a JSON file on disk (see storeFile below) so restarting
// this process doesn't lose the document or desync clients from it.
//
// Protocol (JSON messages over the WebSocket):
//   client -> server  { type: 'hello', clientId }
//     sent right after connecting: the id this connection will use for both
//     collab steps and cursor presence (see clientID/RemoteCursor.clientId).
//   server -> client  { type: 'init', doc, version }
//     reply to 'hello' - the current document and the version it reflects,
//     used to create the client's editor (editorConfig.collab.version).
//   client -> server  { type: 'steps', version, steps, clientID }
//     submits a batch of local steps, as produced by editorConfig.collab's
//     onSendable callback. Ignored if `version` doesn't match the server's
//     current version (the client will catch up once it receives the steps
//     it's missing, and will then automatically resubmit its rebased ones).
//   server -> client  { type: 'steps', version, steps, clientIDs }
//     broadcast to every connected client (including the sender) whenever a
//     submitted batch is accepted - see Editor.svelte's collab.receiveSteps.
//   client -> server  { type: 'save', doc, version }
//     persists the sender's current document as the new central copy, as
//     long as `version` still matches the server's current version (i.e. the
//     sender is fully caught up) - see App.svelte's onvaluechange.
//   client -> server  { type: 'cursor', from, to, user } | { type: 'cursor', clear: true }
//     upserts (or, with `clear`, removes) the sender's own entry in the
//     cursor roster, as produced by editorConfig.cursors' onLocalCursorChange
//     callback. Not versioned/ordered like steps - presence is ephemeral and
//     never persisted, so the latest update always wins.
//   server -> client  { type: 'cursors', cursors }
//     the full current roster (everyone's cursor, sender included), sent to
//     every connected client whenever it changes - see Editor.svelte's
//     `editor.cursors.set()`. Each client is expected to filter out its own
//     clientId before rendering (see App.svelte).

import { WebSocketServer } from 'ws';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const port = Number(process.env.COLLAB_PORT ?? 8989);

// persisted across restarts - delete this file to reset the document back to
// empty (version 0)
const storeFile = join(dirname(fileURLToPath(import.meta.url)), '.collab-store.json');

function loadStore() {
	if (existsSync(storeFile)) {
		try {
			return JSON.parse(readFileSync(storeFile, 'utf-8'));
		} catch {
			// fall through to a fresh store below
		}
	}
	return { version: 0, doc: null };
}

const store = loadStore();

function saveStore() {
	writeFileSync(storeFile, JSON.stringify(store));
}

// cursor presence roster - ephemeral, never persisted, keyed by clientId
const cursors = new Map();

function broadcast(payload) {
	const raw = JSON.stringify(payload);
	for (const client of wss.clients) {
		if (client.readyState === client.OPEN) client.send(raw);
	}
}

function broadcastCursors() {
	broadcast({ type: 'cursors', cursors: [...cursors.values()] });
}

const wss = new WebSocketServer({ port });

wss.on('connection', (ws) => {
	ws.on('message', (raw) => {
		let msg;
		try {
			msg = JSON.parse(raw.toString());
		} catch {
			return;
		}

		if (msg.type === 'hello') {
			ws.clientId = msg.clientId;
			ws.send(JSON.stringify({ type: 'init', version: store.version, doc: store.doc }));
			return;
		}

		if (msg.type === 'cursor') {
			if (!ws.clientId) return;
			if (msg.clear) cursors.delete(ws.clientId);
			else cursors.set(ws.clientId, { clientId: ws.clientId, from: msg.from, to: msg.to, user: msg.user });
			broadcastCursors();
			return;
		}

		if (msg.type === 'save') {
			// only accept a snapshot from a client that's fully caught up -
			// otherwise it'd be missing steps other clients already applied
			if (msg.version !== store.version) return;
			store.doc = msg.doc;
			saveStore();
			return;
		}

		if (msg.type !== 'steps') return;
		if (msg.version !== store.version) {
			// stale submission - the client is behind and will resubmit
			// once it catches up via the next broadcast it receives
			console.log(`[collab] rejected steps at version ${msg.version}, current version is ${store.version}`);
			return;
		}

		const clientIDs = msg.steps.map(() => msg.clientID);
		store.version += msg.steps.length;
		saveStore();

		broadcast({
			type: 'steps',
			version: store.version,
			steps: msg.steps,
			clientIDs
		});
	});

	ws.on('close', () => {
		if (ws.clientId && cursors.delete(ws.clientId)) broadcastCursors();
	});
});

console.log(`Collab dev server listening on ws://localhost:${port} (version ${store.version})`);
