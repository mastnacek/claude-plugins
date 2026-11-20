// stats — what happened today, kept in $.state and written through to $.store.
//
// The root hooks the events and calls these by name:
//   startStats       reads the store (today's record, or a fresh day)
//   statsTurnStart   turns +1 (the main loop only)
//   statsCall        errors, file edits, commits, tests green / red
// A new day starts a new record at the next event.

import type { EngineInterface } from "claude-code";
import { atom, read, update } from "claude-code";
import type { CallInfo } from "../../shared/classify";
import { count, dayKey, emptyDay, onDay, parseStored } from "./day";
import type { Event } from "./day";

const statsAtom = atom({ plugin: "cc-pixel-buddy", key: "stats" } as const, emptyDay(""), { shape: "stats-1" });

const STORE_KEY = "stats";

async function record($: EngineInterface, ev: Event): Promise<void> {
	const today = dayKey(await $.clock.now());
	await update($, statsAtom, (s) => count(onDay(s, today), ev));
	await $.store.set(STORE_KEY, await read($, statsAtom));
}

export function statsTurnStart($: EngineInterface): Promise<void> {
	return record($, { kind: "turn" });
}
export function statsCall($: EngineInterface, info: CallInfo): Promise<void> {
	return record($, { kind: "call", info });
}

/** Session start, run by the root. */
export async function startStats($: EngineInterface): Promise<void> {
	const today = dayKey(await $.clock.now());
	const stored = parseStored(await $.store.get(STORE_KEY), today);
	await update($, statsAtom, () => stored);
}
