import { collab, getVersion, receiveTransaction, sendableSteps } from "prosemirror-collab";
import { Step } from "prosemirror-transform";
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

export type CollabClientID = string | number;

// The wire shape of a single step, as produced by Step.toJSON() / consumed by
// Step.fromJSON(schema, json) - opaque to us, the host just relays it as-is.
export type CollabStepJSON = ReturnType<Step["toJSON"]>;

// A batch of local steps ready to be pushed to the host's server-side
// authority (see prosemirror-collab's sendableSteps). `version` is the
// version these steps apply on top of; `clientID` identifies this editor
// instance so the authority (and other clients) can recognize steps that
// originated here once they're rebroadcast.
export interface CollabSendable {
    version: number;
    steps: CollabStepJSON[];
    clientID: CollabClientID;
}

export interface CollabPluginConfig {
    // the version this editor's initial doc corresponds to - must match
    // whatever version the host's server-side authority handed out alongside
    // the doc JSON used to create the editor (default: 0)
    version?: number;
    // identifies this editor instance to the server-side authority;
    // prosemirror-collab generates a random one if omitted, but a
    // host-supplied id (e.g. the logged-in user's session id) makes
    // server-side debugging easier
    clientID?: CollabClientID;
    // Called whenever local edits produce steps ready to send to the
    // server-side authority. The host owns actual transport (WebSocket,
    // HTTP, ...) and retry behavior - e.g. if the authority rejects a batch
    // for being out of date, the host is expected to feed the resulting
    // steps back in via the Editor component's `collab.receiveSteps()`,
    // which causes prosemirror-collab to rebase the pending edits and this
    // plugin to call onSendable again with the updated batch.
    onSendable: (sendable: CollabSendable) => void;
}

export const collabPluginKey = new PluginKey("collabSendable");

/**
 * Wraps prosemirror-collab's `collab` plugin so the host only has to supply
 * a transport (onSendable) and feed remote steps back in via the Editor
 * component's `collab.receiveSteps()` method - see Editor.svelte.
 *
 * This plugin never talks to a server itself. The server-side authority
 * (assigning versions, rebroadcasting steps to other clients, persisting the
 * document) is entirely up to the host app. See DEV.md for a minimal example
 * server used for local development.
 */
export default function collabPlugin(config: CollabPluginConfig) {
    const base = collab({ version: config.version ?? 0, clientID: config.clientID });

    return [
        base,
        new Plugin({
            key: collabPluginKey,
            view(editorView: EditorView) {
                // sendableSteps() returns a fresh object every call, even when there's
                // nothing new relative to the last check - since steps for an unconfirmed
                // version only ever grow (or get cleared once confirmed/rebased), a
                // (version, step count) pair uniquely identifies a batch, so this is
                // enough to avoid re-sending the same batch on every unrelated view update
                // (e.g. a selection-only transaction).
                let lastSent: { version: number; stepCount: number } | null = null;

                function checkSendable(view: EditorView) {
                    const sendable = sendableSteps(view.state);
                    if (!sendable) return;

                    if (
                        lastSent &&
                        lastSent.version === sendable.version &&
                        lastSent.stepCount === sendable.steps.length
                    ) {
                        return;
                    }
                    lastSent = { version: sendable.version, stepCount: sendable.steps.length };

                    config.onSendable({
                        version: sendable.version,
                        steps: sendable.steps.map(s => s.toJSON()),
                        clientID: sendable.clientID
                    });
                }

                checkSendable(editorView);

                return {
                    update: checkSendable
                };
            }
        })
    ];
}

/**
 * Turns steps received from the server-side authority (already parsed from
 * JSON, in wire order, alongside the clientID that produced each one) into a
 * transaction and dispatches it. Must be called for every batch broadcast by
 * the authority, including batches made up of this client's own steps being
 * confirmed - prosemirror-collab uses the clientIDs to tell the two cases
 * apart. Called from Editor.svelte's exposed `collab.receiveSteps()`.
 */
export function receiveCollabSteps(
    view: EditorView,
    steps: CollabStepJSON[],
    clientIDs: CollabClientID[]
) {
    const schema = view.state.schema;
    const parsedSteps = steps.map(s => Step.fromJSON(schema, s));
    const tr = receiveTransaction(view.state, parsedSteps, clientIDs);
    view.dispatch(tr);
}

export function getCollabVersion(view: EditorView): number {
    return getVersion(view.state);
}
