// policy.ts — pure logic of rules: which `uma` calls fetch the rules, how their
// output is read, and the exact system-prompt text (a port of pi's
// `formatRulesForSystemPrompt`, English like the model's instructions).

export type Rule = { title: string; fact_type: string; body: string };

/** Fact types that act as rules, in the order pi lists them. */
export const RULE_TYPES = ["decision", "pattern"] as const;

/** At most this many rules reach the prompt. */
export const MAX_RULES = 10;

/** `uma list --json --type <type>` — active facts only (deprecated ones are hidden by default). */
export const rulesArgv = (type: (typeof RULE_TYPES)[number]): string[] => ["uma", "list", "--json", "--type", type];

/** The facts of one `uma list --json` answer; anything unreadable → undefined. */
export function parseRules(stdout: string): Rule[] | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		return undefined;
	}
	if (!Array.isArray(parsed)) return undefined;
	return parsed
		.filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null)
		.map((f) => ({
			title: typeof f.title === "string" ? f.title : "",
			fact_type: typeof f.fact_type === "string" ? f.fact_type : "",
			body: typeof f.body === "string" ? f.body : "",
		}));
}

/** The system-prompt section; empty when there are no rules. Same text as pi. */
export function formatRules(rules: readonly Rule[]): string {
	if (rules.length === 0) return "";
	const lines = [
		"## Project Memory & Architectural Rules (from UMA)",
		"Strictly follow these recorded decisions and patterns when implementing solutions:",
	];
	for (const r of rules.slice(0, MAX_RULES)) {
		const summaryLine = r.body.split("\n")[0] || "";
		lines.push(`- [${r.fact_type}] ${r.title}: ${summaryLine}`);
	}
	return lines.join("\n");
}

/**
 * The system-prompt section that tells the model what language to write facts in. Always sent
 * (independent of `/uma append`, which switches the rules off): the person reads facts in Czech
 * through display translation, but UMA stores English.
 */
export const LANGUAGE_RULE = [
	"## UMA fact language",
	"Write the title, body and tags of every fact you save with uma_write or uma_supersede in English, even when the user writes in Czech or another language. The user sees a Czech translation when they review the proposal; the English text is what is stored.",
].join("\n");
