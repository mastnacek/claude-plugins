// Day statistics: pure helpers (local date, empty day, reading what $.store holds, counting).

import type { DayStats } from "claude-code";
import type { CallInfo } from "../../shared/classify";

export const COUNTERS = ["turns", "toolErrors", "edits", "commits", "testsPass", "testsFail"] as const;

export function dayKey(ms: number): string {
	const d = new Date(ms);
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function emptyDay(day: string): DayStats {
	return { day, turns: 0, toolErrors: 0, edits: 0, commits: 0, testsPass: 0, testsFail: 0 };
}

/** What the store held, as today's stats: another day, junk or nothing → a fresh day; missing / bad counters → 0. */
export function parseStored(raw: unknown, today: string): DayStats {
	if (typeof raw !== "object" || raw === null) return emptyDay(today);
	const r = raw as Record<string, unknown>;
	if (r.day !== today) return emptyDay(today);
	const out = emptyDay(today);
	for (const k of COUNTERS) {
		const v = r[k];
		if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = Math.floor(v);
	}
	return out;
}

/** The day's stats as of `today`: yesterday's become an empty day. */
export function onDay(s: DayStats, today: string): DayStats {
	return s.day === today ? s : emptyDay(today);
}

export type Event = { kind: "turn" } | { kind: "call"; info: CallInfo };

export function count(s: DayStats, ev: Event): DayStats {
	if (ev.kind === "turn") return { ...s, turns: s.turns + 1 };
	const i = ev.info;
	return {
		...s,
		toolErrors: s.toolErrors + (i.isError ? 1 : 0),
		edits: s.edits + (i.isEdit ? 1 : 0),
		commits: s.commits + (i.isCommit ? 1 : 0),
		testsPass: s.testsPass + (i.test === "pass" ? 1 : 0),
		testsFail: s.testsFail + (i.test === "fail" ? 1 : 0),
	};
}
