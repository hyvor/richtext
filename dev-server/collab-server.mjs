// Minimal local WebSocket server for exercising editorConfig.collab during
// development - see DEV.md. This is NOT the "server-side implementation"
// referenced by CollabPluginConfig; a real host is expected to build its own
// authority (with auth, persistence, multiple documents, etc). This one only
// relays prosemirror-collab steps between whatever browser tabs are
// connected, for a single in-memory "document" that resets whenever the
// process restarts.
//
// Protocol (JSON messages over the WebSocket):
//   client -> server  { type: 'steps', version, steps, clientID }
//     submits a batch of local steps, as produced by editorConfig.collab's
//     onSendable callback. Ignored if `version` doesn't match the server's
//     current version (the client will catch up once it receives the steps
//     it's missing, and will then automatically resubmit its rebased ones).
//   server -> client  { type: 'init', version, steps, clientIDs }
//     sent right after connecting: the full step history so far, so a
//     freshly-loaded client (starting from version 0) can catch up.
//   server -> client  { type: 'steps', version, steps, clientIDs }
//     broadcast to every connected client (including the sender) whenever a
//     submitted batch is accepted - see Editor.svelte's collab.receiveSteps.

import { WebSocketServer } from 'ws';

const port = Number(process.env.COLLAB_PORT ?? 8989);

// the whole "document" this dev server knows about: just the ordered list of
// accepted steps and who sent each one - never applied to an actual doc,
// since this process has no schema and doesn't need one to relay JSON
const history = {
	version: 0,
	steps: [],
	clientIDs: []
};

const wss = new WebSocketServer({ port });

wss.on('connection', (ws) => {
	ws.send(JSON.stringify({
		type: 'init',
		version: history.version,
		steps: history.steps,
		clientIDs: history.clientIDs
	}));

	ws.on('message', (raw) => {
		let msg;
		try {
			msg = JSON.parse(raw.toString());
		} catch {
			return;
		}

		if (msg.type !== 'steps') return;
		if (msg.version !== history.version) {
			// stale submission - the client is behind and will resubmit
			// once it catches up via the next broadcast it receives
			return;
		}

		const clientIDs = msg.steps.map(() => msg.clientID);
		history.steps.push(...msg.steps);
		history.clientIDs.push(...clientIDs);
		history.version += msg.steps.length;

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

console.log(`Collab dev server listening on ws://localhost:${port}`);
