// Minimal local WebSocket server for exercising editorConfig.collab during
// development - see DEV.md. This is NOT the "server-side implementation"
// referenced by CollabPluginConfig; a real host is expected to build its own
// authority (with auth, persistence, multiple documents, etc). This one only
// relays prosemirror-collab steps between whatever browser tabs are
// connected, for a single "document" - it doesn't hold the document itself
// (this process has no schema to apply steps with), only the ordered step
// history, persisted to a JSON file on disk (see historyFile below) so
// restarting this process doesn't desync it from clients that already
// caught up to a later version (they persist {doc, version} themselves -
// see App.svelte).
//
// Protocol (JSON messages over the WebSocket):
//   client -> server  { type: 'hello', version }
//     sent right after connecting: the version the client's own (locally
//     persisted) document already reflects.
//   server -> client  { type: 'init', version, steps, clientIDs }
//     reply to 'hello' - only the steps *after* the client's stated version,
//     so an already-caught-up client doesn't get steps it has already
//     applied replayed on top of itself.
//   client -> server  { type: 'steps', version, steps, clientID }
//     submits a batch of local steps, as produced by editorConfig.collab's
//     onSendable callback. Ignored if `version` doesn't match the server's
//     current version (the client will catch up once it receives the steps
//     it's missing, and will then automatically resubmit its rebased ones).
//   server -> client  { type: 'steps', version, steps, clientIDs }
//     broadcast to every connected client (including the sender) whenever a
//     submitted batch is accepted - see Editor.svelte's collab.receiveSteps.

import { WebSocketServer } from 'ws';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const port = Number(process.env.COLLAB_PORT ?? 8989);

// persisted across restarts so the server's version stays valid for clients
// that already caught up to it in a previous run - delete this file (and
// clear the app's localStorage, so both reset together) to start over
const historyFile = join(dirname(fileURLToPath(import.meta.url)), '.collab-history.json');

function loadHistory() {
	if (existsSync(historyFile)) {
		try {
			return JSON.parse(readFileSync(historyFile, 'utf-8'));
		} catch {
			// fall through to a fresh history below
		}
	}
	return { version: 0, steps: [], clientIDs: [] };
}

const history = loadHistory();

function saveHistory() {
	writeFileSync(historyFile, JSON.stringify(history));
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
			// clamp: a client can be "ahead" if the server's history file was
			// reset without also clearing the client's localStorage - there's
			// no way to reconcile that here, so it just won't have anything
			// new to catch up on (see the desync note in DEV.md)
			const from = Math.max(0, Math.min(msg.version ?? 0, history.version));
			ws.send(JSON.stringify({
				type: 'init',
				version: history.version,
				steps: history.steps.slice(from),
				clientIDs: history.clientIDs.slice(from)
			}));
			return;
		}

		if (msg.type !== 'steps') return;
		if (msg.version !== history.version) {
			// stale submission - the client is behind and will resubmit
			// once it catches up via the next broadcast it receives
			console.log(`[collab] rejected steps at version ${msg.version}, current version is ${history.version}`);
			return;
		}

		const clientIDs = msg.steps.map(() => msg.clientID);
		history.steps.push(...msg.steps);
		history.clientIDs.push(...clientIDs);
		history.version += msg.steps.length;
		saveHistory();

		const payload = JSON.stringify({
			type: 'steps',
			version: history.version,
			steps: msg.steps,
			clientIDs
		});
		for (const client of wss.clients) {
			if (client.readyState === client.OPEN) client.send(payload);
		}
	});
});

console.log(`Collab dev server listening on ws://localhost:${port} (version ${history.version})`);
