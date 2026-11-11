// log.ts — pure part of the decision log (port of pi's shared/decision_log.ts):
// one entry per answer of the person to an immune dialog, kept in `$.store`
// (key "immuneLog"), never in memory facts. Evidence for tuning the mode:
// "do I just approve whatever is recommended?"

import type { PluginState, ShapedValue } from "claude-code";
import type { Relation } from "./recommendation";

type Out = ShapedValue<PluginState["cc-uma-memory"]["commandOutputs"]>[string];

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

export type Summary = { total: number; approved: number; blocked: number; yesRecommended: number; yesApproved: number; noRecommended: number; noBlocked: number; touch: number; touchApproved: number; noAdvice: number };

export function summarize(log: Decision[]): Summary {
	const s: Summary = { total: log.length, approved: 0, blocked: 0, yesRecommended: 0, yesApproved: 0, noRecommended: 0, noBlocked: 0, touch: 0, touchApproved: 0, noAdvice: 0 };
	for (const e of log) {
		if (e.approved) s.approved += 1;
		else s.blocked += 1;
		if (e.relation === undefined) s.noAdvice += 1;
		if (e.relation === "touches") {
			s.touch += 1;
			if (e.approved) s.touchApproved += 1;
		}
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
	return `🛡️ Rozhodnutí interceptoru: ${s.total} celkem · schváleno ${s.approved}, zablokováno ${s.blocked} · doporučeno Ano: ${s.yesRecommended} (schválil jsi ${s.yesApproved}) · doporučeno Ne: ${s.noRecommended} (zablokoval jsi ${s.noBlocked}) · dotýká se: ${s.touch} (schválil jsi ${s.touchApproved}) · bez rady: ${s.noAdvice} — pokud doporučení vždy přijímáš, /uma immune warn odstraní dialogy.`;
}

/** The same statistics as data for the person (uma-command draws it); the model keeps `statsText`. */
export function statsOut(s: Summary): Out {
	if (s.total === 0) return { title: "imunita · statistika", tone: "normal", lines: [{ text: "Zatím žádná zaznamenaná rozhodnutí — log se plní, jak odpovídáš na souhlasové dialogy." }] };
	return {
		title: `imunita · statistika · ${s.total} rozhodnutí`,
		tone: "normal",
		fields: [
			{ label: "rozhodnutí celkem", value: String(s.total) },
			{ label: "doporučeno Ano", value: `${s.yesRecommended} (schválil jsi ${s.yesApproved})` },
			{ label: "schváleno / zablokováno", value: `${s.approved} / ${s.blocked}` },
			{ label: "doporučeno Ne", value: `${s.noRecommended} (zablokoval jsi ${s.noBlocked})` },
			{ label: "dotýká se", value: `${s.touch} (schválil jsi ${s.touchApproved})` },
			{ label: "bez rady", value: String(s.noAdvice) },
		],
		lines: [{ text: "Pokud doporučení vždy přijímáš, /uma immune warn odstraní dialogy.", tone: "dim" }],
	};
}
