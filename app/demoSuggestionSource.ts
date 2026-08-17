import type { SuggestionSource, SuggestionSourceEntry, SuggestionReply } from '../src/lib';

// Stand-in for a host's real backend (auth-checked API, database, ...) - the
// suggestions plugin never stores author/comments itself, only an `id` (see
// SuggestionSource in src/lib/plugins/suggestions/plugin-suggestions.ts),
// mirroring how the demo's `fileUploader` stands in for real upload storage.
// Backed by localStorage purely so the demo pages have something to persist
// to across reloads; a real host would call its own API here instead.
export function createDemoSuggestionSource(storageKey: string): SuggestionSource {
	function read(): Record<string, SuggestionSourceEntry> {
		try {
			return JSON.parse(localStorage.getItem(storageKey) ?? '{}');
		} catch {
			return {};
		}
	}

	function write(data: Record<string, SuggestionSourceEntry>) {
		localStorage.setItem(storageKey, JSON.stringify(data));
	}

	return {
		async get(ids: string[]) {
			const all = read();
			return Object.fromEntries(ids.map((id) => [id, all[id] ?? null]));
		},
		create(id: string, _type, author, timestamp) {
			const all = read();
			if (!all[id]) {
				all[id] = { author, timestamp, comments: [] };
				write(all);
			}
		},
		reply(id: string, reply: SuggestionReply) {
			const all = read();
			const entry = all[id] ?? { author: reply.author, timestamp: reply.timestamp, comments: [] };
			entry.comments = [...entry.comments, reply];
			all[id] = entry;
			write(all);
		},
		resolve(id: string) {
			const all = read();
			if (id in all) {
				delete all[id];
				write(all);
			}
		},
		editReply(id: string, replyId: string, content: string) {
			const all = read();
			const entry = all[id];
			if (!entry) return;
			entry.comments = entry.comments.map((c) => (c.id === replyId ? { ...c, content } : c));
			all[id] = entry;
			write(all);
		},
		deleteReply(id: string, replyId: string) {
			const all = read();
			const entry = all[id];
			if (!entry) return;
			entry.comments = entry.comments.filter((c) => c.id !== replyId);
			all[id] = entry;
			write(all);
		}
	};
}
