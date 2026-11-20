// policy.ts — pure logic of immune (port of pi's slices/immune/index.ts):
// what an edit is, how it is judged against the pain score and the rules, what
// each mode does with the verdict, the dialog texts. No `$`, no I/O.

import type { ContractBreach, RuleL1 } from "./contracts";

export type { ContractBreach, RuleL1 } from "./contracts";

export type Mode = "off" | "warn" | "ask" | "auto";

/** Verdict of `uma risk pain <path> --json`. */
export type PainVerdict = { score: number; band: "low" | "medium" | "critical" };

/** Fact types that act as rules for the interceptor (pi's RULE_FACT_TYPES). */
export const RULE_FACT_TYPES = ["decision", "pattern", "preference", "correction"] as const;

export const PAIN_ARGV = (path: string): string[] => ["uma", "risk", "pain", path, "--json"];
export const RULES_ARGV = (type: string): string[] => ["uma", "list", "--json", "--type", type];

// Dialog texts (pi's i18n, Czech).
export const DIALOG_TITLE = "🛡️ UMA imunitní interceptor";
export const PROCEED = "Ano, pokračovat";
export const BLOCK = "Ne, zablokovat";
/** The person said "Ne, zablokovat": the model must not retry the same edit (as write-gate's DENIED_REASON). */
export const DENIED_BY_USER = "Uživatel úpravu zamítl. Nezkoušej ji znovu bez nového pokynu.";

export const NO_UI_REASON = "Imunitní interceptor se potřeboval zeptat uživatele, ale nelze (bez dialogu). Úprava zablokována.";

// ── assessment (thresholds and metric verbatim from pi) ───────────────────

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter((token) => token.length >= 4);
}

/** What discriminates is the rule's coverage of the EDIT plus an absolute shared-token floor (pi: validated on 6 live fixtures). */
const MIN_EDIT_TOKENS = 5;
const MIN_SHARED_TOKENS = 4;
const MIN_CONTAINMENT = 0.25;

/** The single rule an edit most likely touches (first match wins), or undefined. */
export function matchRule(rules: RuleL1[], addedText: string): RuleL1 | undefined {
	const addedTokens = new Set(tokenize(addedText));
	if (addedTokens.size < MIN_EDIT_TOKENS) return undefined;
	for (const rule of rules) {
		const ruleTokens = new Set(tokenize(`${rule.title} ${rule.body}`));
		let shared = 0;
		for (const token of addedTokens) if (ruleTokens.has(token)) shared += 1;
		if (shared >= MIN_SHARED_TOKENS && shared / addedTokens.size >= MIN_CONTAINMENT) return rule;
	}
	return undefined;
}

/** Human-readable warnings for an edit; empty = nothing to say. */
export function assessEdit(pain: PainVerdict | undefined, rules: RuleL1[], addedText: string): string[] {
	const warnings: string[] = [];
	if (pain?.band === "medium") {
		warnings.push(`[UMA Risk] Pain score ${pain.score}/100 for this file — run the affected tests after editing.`);
	}
	if (pain?.band === "critical") {
		warnings.push(`[UMA Risk] Pain score ${pain.score}/100 — test-first: propose the failing test before changing this file.`);
	}
	const rule = matchRule(rules, addedText);
	if (rule) {
		warnings.push(`[UMA Rule] This edit may touch active rule ${rule.id} "${rule.title}" — verify compliance before saving.`);
	}
	return warnings;
}

// ── what is an edit ────────────────────────────────────────────────────────

/** Whether the path is in a UMA store (project `.uma/` or the global store); write-gate guards those. */
export function isStorePath(targetPath: string): boolean {
	const norm = targetPath.replace(/\\/g, "/").toLowerCase();
	if (norm.includes("/.uma/") || norm.startsWith(".uma/") || norm.endsWith("/.uma") || norm === ".uma") return true;
	const globalMarkers = [
		"/uma/uma/data/global/",
		"/uma/data/global/",
		"/com.uma.uma/global/",
		"/.local/share/uma/global/",
		"/appdata/roaming/uma/global/",
		"/application support/uma/global/",
	];
	return globalMarkers.some((m) => norm.includes(m) || norm.endsWith(m.slice(0, -1)));
}

export type Edit = { path: string; added: string };

/** `{path, added}` of a Write / Edit / NotebookEdit call; undefined for anything else, for a store path, or when nothing is added. */
export function extractEdit(call: Record<string, unknown>): Edit | undefined {
	const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);
	let path: string | undefined;
	let added: string | undefined;
	switch (call.tool) {
		case "Write":
			path = str(call.file_path);
			added = str(call.content);
			break;
		case "Edit":
			path = str(call.file_path);
			added = str(call.new_string);
			break;
		case "NotebookEdit":
			path = str(call.notebook_path);
			added = call.edit_mode === "delete" ? undefined : str(call.new_source);
			break;
		default:
			return undefined;
	}
	if (!path || added === undefined || isStorePath(path)) return undefined;
	return { path, added };
}

// ── parsing what `uma` says ────────────────────────────────────────────────

export function parsePain(stdout: string): PainVerdict | undefined {
	try {
		const v = JSON.parse(stdout) as Partial<PainVerdict>;
		if (typeof v.score === "number" && (v.band === "low" || v.band === "medium" || v.band === "critical")) return { score: v.score, band: v.band };
	} catch {
		// unreadable → no verdict
	}
	return undefined;
}

/** The rules out of one `uma list --json`; unreadable = none (the set stays smaller, not wrong). */
export function parseRules(stdout: string): RuleL1[] {
	try {
		const list = JSON.parse(stdout) as unknown;
		if (!Array.isArray(list)) return [];
		return list.filter(
			(r): r is RuleL1 => typeof r === "object" && r !== null && typeof (r as RuleL1).id === "string" && typeof (r as RuleL1).title === "string" && typeof (r as RuleL1).body === "string",
		);
	} catch {
		return [];
	}
}

// ── mode policy (pi's decideImmuneAction) ──────────────────────────────────

export type Action =
	| { kind: "allow" }
	| { kind: "notify"; message: string }
	| { kind: "confirm"; message: string }
	| { kind: "block"; reason: string };

/**
 * - off:  nothing
 * - warn: show the warnings, never disturb the flow
 * - ask:  every warning set is a dialog; a decline blocks with the warning as reason
 * - auto: a VERIFIED deny contract blocks (deterministic, the reason is shown to the model and logged
 *         for the person); heuristic warnings still ask
 */
export function decideAction(mode: Mode, warnings: string[], breaches: ContractBreach[] = []): Action {
	if (mode === "off") return { kind: "allow" };
	const denies = breaches.filter((b) => b.severity === "deny");
	const warnBreaches = breaches.filter((b) => b.severity === "warn");

	if (denies.length > 0) {
		const message = denies
			.map(
				(b) =>
					`[UMA Immune System Block]: Your proposed change in '${b.file}' violates active memory contract [${b.factId}] "${b.title}". Rule: ${b.ruleMessage}. Revise your implementation to comply with this constraint.`,
			)
			.join("\n\n");
		if (mode === "auto") return { kind: "block", reason: message };
		return mode === "ask" ? { kind: "confirm", message } : { kind: "notify", message };
	}

	const all = [...warnBreaches.map((b) => `[UMA Contract] '${b.file}' may violate contract [${b.factId}] "${b.title}" (advisory only): ${b.ruleMessage}`), ...warnings];
	if (all.length === 0) return { kind: "allow" };
	const message = all.join("\n");
	if (mode === "warn") return { kind: "notify", message };
	return { kind: "confirm", message: mode === "auto" ? `${message}\n(auto mode: blocks only contract-backed rules; heuristics ask)` : message };
}

/** In a dialog mode, a dialog is only worth the interruption for a rule/contract hit or high pain; otherwise the warning rides along to the model. */
export function worthDialog(pain: PainVerdict | undefined, matched: RuleL1 | undefined, breaches: ContractBreach[]): boolean {
	return breaches.length > 0 || matched !== undefined || (pain?.score ?? 0) >= 50;
}

/** One line for `$.ui.log`: `\n` would draw as a stray glyph. */
export function oneLine(message: string): string {
	return message.replace(/\s*\n+\s*/g, " · ");
}
