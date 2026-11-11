// log.ts — pure part of the decision log (port of pi's shared/decision_log.ts):
// one entry per answer of the person to an immune dialog, kept in `$.store`
// (key "immuneLog"), never in memory facts. Evidence for tuning the mode:
// "do I just approve whatever is recommended?"

import type { Relation } from "./recommendation";

export type Decision = { ts: string; ruleId?: string; relation?: Relation; confidence?: number; approved: boolean };

export const LOG_KEY = "immuneLog";
const MAX_ENTRIES = 500;

/** The stored log, junk dropped. */
export function parseLog(value: unknown): Decision[] {
	if (!Array.isArray(value)) return [];
	return value.filter((e): e is Decision => typeof e === "object" && e !== null && typeof (e as Decision).approved === "boolean" && typeof (e as Decision).ts === "string");
}

/** The log with one more entry, the oldest dropped past the cap. */
export function appended(log: Decision[], entry: Decision): Decision[] {
	return [...log, entry].slice(-MAX_ENTRIES);
}

export type Summary = { total: number; yesRecommended: number; yesApproved: number; noRecommended: number; noBlocked: number };

export function summarize(log: Decision[]): Summary {
	const s: Summary = { total: log.length, yesRecommended: 0, yesApproved: 0, noRecommended: 0, noBlocked: 0 };
	for (const e of log) {
		if (e.relation === "unrelated") {
			s.yesRecommended += 1;
			if (e.approved) s.yesApproved += 1;
		}
		if (e.relation === "violates") {
			s.noRecommended += 1;
			if (!e.approved) s.noBlocked += 1;
		}
	}
	return s;
}

/** The `/uma immune stats` line (one line: the model reads a command's first line). */
export function statsText(s: Summary): string {
	if (s.total === 0) return "🛡️ Zatím žádná zaznamenaná rozhodnutí — log se plní, jak odpovídáš na souhlasové dialogy.";
	return `🛡️ Rozhodnutí interceptoru: ${s.total} celkem · doporučeno Ano: ${s.yesRecommended} (schválil jsi ${s.yesApproved}) · doporučeno Ne: ${s.noRecommended} (zablokoval jsi ${s.noBlocked}) — pokud doporučení vždy přijímáš, /uma immune warn odstraní dialogy.`;
}
