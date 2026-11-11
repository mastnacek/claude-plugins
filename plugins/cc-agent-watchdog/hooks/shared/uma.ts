// uma.ts — reading the sidecar of cc-uma-memory: which UMA facts the model had in context.
//
// SHARED FILE CONTRACT (the only thing this plugin shares with cc-uma-memory; no code, no import):
//
//   <ledger folder>/<YYYY-MM-DD>_<role>_<id8>.uma.jsonl     — beside the ledger `….jsonl` of the same session
//   one line: {"ts":<ms>,"session":"<id>","kind":"uma-context","source":"recall"|"rules","factIds":["<id>",…],"scope":"prompt"|"session"}
//
// IDs only, never the facts' content. A missing or unreadable file means "no information": nothing is added to a report.

import type { EngineInterface } from "claude-code";

type $ = EngineInterface;

export type UmaContext = { ts: number; source: string; factIds: string[] };

/** The sidecar that belongs to a ledger file. */
export const sidecarPath = (ledgerPath: string): string => ledgerPath.replace(/\.jsonl$/, ".uma.jsonl");

export function parseUmaContext(text: string): UmaContext[] {
	const out: UmaContext[] = [];
	for (const line of text.split("\n")) {
		if (!line.trim()) continue;
		try {
			const ev = JSON.parse(line) as { ts?: unknown; kind?: unknown; source?: unknown; factIds?: unknown };
			if (ev.kind !== "uma-context" || typeof ev.ts !== "number" || !Array.isArray(ev.factIds)) continue;
			out.push({ ts: ev.ts, source: typeof ev.source === "string" ? ev.source : "", factIds: ev.factIds.filter((i): i is string => typeof i === "string" && i !== "") });
		} catch {
			// a torn line is skipped
		}
	}
	return out;
}

/** `undefined` when the session has no sidecar (the report stays as it was). */
export async function readUmaContext($: $, ledgerPath: string): Promise<UmaContext[] | undefined> {
	const path = sidecarPath(ledgerPath);
	try {
		if (!(await $.fs.exists(path))) return undefined;
		return parseUmaContext(String(await $.fs.read(path)));
	} catch {
		return undefined;
	}
}

/** Distinct fact IDs delivered up to `ts` (inclusive), in order of delivery; everything when `ts` is left out. */
export function factsAt(ctx: readonly UmaContext[], ts = Number.POSITIVE_INFINITY): string[] {
	const seen = new Set<string>();
	for (const c of ctx) if (c.ts <= ts) for (const id of c.factIds) seen.add(id);
	return [...seen];
}

/** Czech plural: 1 fakt, 2–4 fakty, 0 and 5+ faktů. */
export const factCount = (n: number): string => `${n} ${n === 1 ? "fakt" : n >= 2 && n <= 4 ? "fakty" : "faktů"}`;

const SHOWN = 6;

/** `🧠 fakty v kontextu: 01M744E2, 01M744E3 (+2)`; the first 8 characters identify a fact. */
export function factsLine(ids: readonly string[]): string {
	if (ids.length === 0) return "🧠 fakty v kontextu: žádné";
	const shown = ids.slice(0, SHOWN).map((i) => i.slice(0, 8)).join(", ");
	return `🧠 fakty v kontextu: ${shown}${ids.length > SHOWN ? ` (+${ids.length - SHOWN})` : ""}`;
}
