// request.ts — the pure side of the `watchdog_waiver` tool: reading the model's input, the dialog's words,
// and what the model is told. No `$`.

import type { Role, Rule } from "../../shared/types";
import { MAX_CALLS } from "../../shared/waivers";

export const TOOL_DESCRIPTION =
	"Požádá o výjimku z pravidla watchdogu PŘED vědomým porušením pravidla, které nevede k instant failure " +
	"(např. W29 při mechanické hromadné úpravě souborů přes sed). Výjimku uvidí a potvrdí člověk nebo orchestrátor v dialogu; " +
	"bez schválení se porušení počítá (v režimu block se volání zamítne). Pravidla s instant failure (git zápis, sudo, mazání, " +
	"přihlašovací soubory …) výjimku nedostanou a nástroj je odmítne bez dialogu. " +
	"Rozsah: výchozí do konce tahu; scope.calls omezí výjimku na tolik následujících volání (nejvýš 20).";

export const INPUT_SCHEMA = {
	type: "object",
	properties: {
		rule: { type: "string", description: "Id pravidla, např. W29." },
		reason: { type: "string", description: "Proč je porušení nutné a co přesně uděláš." },
		scope: {
			type: "object",
			description: "Rozsah výjimky; bez něj platí do konce tahu.",
			properties: { calls: { type: "integer", minimum: 1, maximum: MAX_CALLS, description: "Počet následujících volání nástrojů." } },
		},
	},
	required: ["rule", "reason"],
} as const;

export type Request = { rule: string; reason: string; calls?: number; clamped: boolean };

/** The model's input as a request, or why it is unusable. */
export function parseRequest(input: Record<string, unknown>): Request | { error: string } {
	const rule = typeof input.rule === "string" ? input.rule.trim().toUpperCase() : "";
	if (!/^W\d{2}$/.test(rule)) return { error: "Chybí platné id pravidla (rule), např. „W29“." };
	const reason = typeof input.reason === "string" ? input.reason.replace(/\s+/g, " ").trim().slice(0, 300) : "";
	if (reason.length < 5) return { error: "Chybí důvod (reason): napiš, proč je porušení nutné." };
	const scope = typeof input.scope === "object" && input.scope !== null ? (input.scope as Record<string, unknown>) : {};
	const raw = typeof scope.calls === "number" && Number.isFinite(scope.calls) ? Math.floor(scope.calls) : undefined;
	if (raw !== undefined && raw < 1) return { error: "scope.calls musí být aspoň 1 (nebo ho vynech: výjimka pak platí do konce tahu)." };
	const calls = raw === undefined ? undefined : Math.min(raw, MAX_CALLS);
	return calls === undefined ? { rule, reason, clamped: false } : { rule, reason, calls, clamped: raw !== calls };
}

export const ALLOW = "✅ Povolit";
export const DENY = "❌ Zamítnout";
export const HEADER = "👁 Watchdog";

export const scopeText = (calls: number | undefined): string => (calls === undefined ? "do konce tahu" : `dalších ${calls} volání (nejdéle do konce tahu)`);

/** The dialog: header line, the rule with its description, the role, the reason, the scope. */
export function question(rule: Rule, role: Role, req: Request): string {
	const line = "─".repeat(32);
	return [
		"👁 Watchdog • žádost o výjimku",
		line,
		`📏 Pravidlo   ${rule.id} — ${rule.title}`,
		`🤖 Role       ${role}`,
		`💬 Důvod      ${req.reason}`,
		`⏱ Rozsah     ${scopeText(req.calls)}`,
		line,
		"Povolit výjimku? (Text v poli „Type something“ = zamítnutí s důvodem.)",
	].join("\n");
}

/** The label the person chose; the engine drops the emoji variation selector from a label it returns. */
export function optionOf(answer: string, options: readonly string[]): string {
	const bare = (t: string): string => t.replace(/️/g, "").trim();
	return options.find((o) => bare(o) === bare(answer)) ?? answer;
}

export const granted = (req: Request): string =>
	`Výjimka ${req.rule} povolena: ${scopeText(req.calls)}.${req.clamped ? " (Rozsah jsem zkrátil na nejvýš 20 volání.)" : ""} Porušení v tomto rozsahu se nepočítá.`;

export const refused = (req: Request, why?: string): string => `Výjimka ${req.rule} zamítnuta${why ? `: ${why.slice(0, 300)}` : ""}. Pravidlo dál platí; použij správnou cestu.`;

export const NO_UI = "nelze se zeptat (bez dialogu)";
