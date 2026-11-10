// session-archive.ts — a session's translations kept in $.store, so a resumed
// session still draws them. Each slice archives and restores its own field;
// the record shape { finals, originals } is the one stored since 0.1.0.

import type { EngineInterface } from "claude-code";
import { debug } from "./log";
import type { OriginalRecord } from "./types";

type Archive = { finals?: Record<string, string>; originals?: Record<string, OriginalRecord> };

const INDEX_KEY = "sessions";
const MAX_SESSIONS = 30;

// Writes are read-modify-write of one record; two slices archiving at once
// would drop each other's field, so they run one after another.
let queue: Promise<void> = Promise.resolve();

export function archiveField<K extends keyof Archive>($: EngineInterface, field: K, value: Archive[K]): Promise<void> {
	queue = queue.then(() => write($, field, value));
	return queue;
}

async function write<K extends keyof Archive>($: EngineInterface, field: K, value: Archive[K]): Promise<void> {
	try {
		const id = await $.session.id();
		const key = `session:${id}`;
		const saved = ((await $.store.get(key)) as Archive | undefined) ?? {};
		await $.store.set(key, { ...saved, [field]: value });
		const index = ((await $.store.get(INDEX_KEY)) as string[] | undefined) ?? [];
		const next = [...index.filter((s) => s !== id), id];
		for (const old of next.splice(0, Math.max(0, next.length - MAX_SESSIONS))) await $.store.delete(`session:${old}`);
		await $.store.set(INDEX_KEY, next);
	} catch (error) {
		await debug($, `session archive failed: ${String(error)}`);
	}
}

export async function restoreField<K extends keyof Archive>($: EngineInterface, field: K): Promise<Archive[K]> {
	try {
		const saved = (await $.store.get(`session:${await $.session.id()}`)) as Archive | undefined;
		return saved?.[field];
	} catch {
		return undefined;
	}
}
