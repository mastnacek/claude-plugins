// block.ts — `block` mode: judging a call BEFORE it runs, and the words of a refusal. Pure.
//
// A rule can block only if it is judged from one call's input (`pre` in rules.ts); its predicate
// then runs over a ledger of that one call. Whatever the predicate says is the violation.

import { activeRules } from "./judge";
import { stateOf } from "./settings";
import { refusal, WAIVER_TOOL } from "./waivers";
import type { Config, Hit, Role, Rule, ToolEv } from "./types";

const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

/** The ledger event a `tool.call` would become (nothing ran yet: no exit code, no error). */
export function callOf(e: Record<string, unknown>, meta: { ts: number; session: string; role: Role; cwd: string }): ToolEv {
	const ev: ToolEv = { kind: "tool", ...meta, tool: String(e.tool), isError: false, denied: false, durationMs: 0 };
	const path = str(e.file_path) ?? str(e.notebook_path) ?? str(e.path);
	if (path) ev.path = path;
	const command = str(e.command);
	if (command) ev.command = command;
	const url = str(e.url);
	if (url) ev.url = url;
	return ev;
}

export type Breach = { rule: Rule; hit: Hit };

/** Rules in `block` mode (and active for the role) that this call breaks. Never throws for a rule that fails: it is skipped. */
export function breaches(call: ToolEv, role: Role, cfg: Config): Breach[] {
	const found: Breach[] = [];
	for (const rule of activeRules(role, cfg)) {
		const state = stateOf(rule, cfg);
		if (!state.blockable || state.mode !== "block") continue;
		try {
			const hit = rule.check([call], cfg)[0];
			if (hit) found.push({ rule, hit });
		} catch {
			// a predicate that fails lets the call through
		}
	}
	return found;
}

/** What the model reads when a call is refused. Starts with the rule id; names the waiver tool (see `isBlockReason`). */
export function blockReason(rule: Rule, hit: Hit): string {
	const why = hit.evidence.replace(/\s+/g, " ").slice(0, 160);
	const way = rule.way ?? "správnou cestu";
	return refusal(rule) === undefined
		? `${rule.id}: ${why}. Použij ${way}, nebo požádej o výjimku nástrojem ${WAIVER_TOOL}.`
		: `${rule.id}: ${why}. Použij ${way}; výjimku u tohoto pravidla nelze udělit (${WAIVER_TOOL} ji odmítne).`;
}

/** A denial that is this plugin's own (the ledger marks the call `blocked`; W19 and W20 leave it out). */
export const isBlockReason = (text: string): boolean => /^W\d{2}: [\s\S]*\b(?:watchdog_waiver)\b/.test(text);
