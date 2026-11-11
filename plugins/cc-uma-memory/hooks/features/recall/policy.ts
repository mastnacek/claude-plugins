// policy.ts — pure logic of recall: the `uma recall check` call, the verdict it
// returns, and the hidden context built from it (port of pi-uma's fastbrain policy).

/** The CLI serializes the Scope enum in serde's default external form. */
export type ScopeWire = { Project: string } | "Global";

export type RecallFact = {
	id: string;
	title: string;
	fact_type: string;
	scope: ScopeWire;
	snippet: string;
};

export type RecallVerdict = {
	search: boolean;
	judged_by: string;
	facts: RecallFact[];
	note: string | null;
};

/** Facts inserted per prompt, however many the engine returned. */
export const MAX_INJECTED = 3;
/** Ids sent as `--exclude`; older ones are long out of the model's attention anyway. */
const MAX_EXCLUDE_IDS = 60;
/** Longest prompt text sent to the engine (argv, not a document). */
const MAX_PROMPT_CHARS = 2000;

/** Czech diacritics: the prompt reached recall untranslated (the facts are English). */
const NON_ENGLISH = /[áčďéěíňóřšťúůýž]/i;

/** Keyword check (~0.4 s) and the semantic fallback (measured 1.7–3.6 s; pi allows 15 s). Hook budget is 10 s. */
const TIMEOUT_MS = 3000;
const SEMANTIC_TIMEOUT_MS = 8000;

/** How long one check may run: the semantic fallback for a non-English prompt needs longer. */
export const recallTimeout = (prompt: string): number => (NON_ENGLISH.test(prompt) ? SEMANTIC_TIMEOUT_MS : TIMEOUT_MS);

/**
 * argv of one check. `--` ends option parsing, so a prompt like "- fix the list" stays an argument.
 * A prompt with diacritics is judged by `jev-relevance` with the semantic fallback (as pi does
 * when no English translation exists), so the English facts are still found.
 */
export function recallArgv(prompt: string, excludeIds: readonly string[]): string[] {
	const foreign = NON_ENGLISH.test(prompt);
	return [
		"uma", "recall", "check", "--judge", foreign ? "jev-relevance" : "jev", ...(foreign ? ["--semantic-fallback"] : []),
		"--json", "--max", String(MAX_INJECTED),
		...excludeIds.slice(-MAX_EXCLUDE_IDS).flatMap((id) => ["--exclude", id]),
		"--", prompt.slice(0, MAX_PROMPT_CHARS),
	];
}

function isFact(value: unknown): value is RecallFact {
	if (typeof value !== "object" || value === null) return false;
	const f = value as Record<string, unknown>;
	return typeof f.id === "string" && typeof f.title === "string" && typeof f.fact_type === "string" && typeof f.snippet === "string" && f.scope !== undefined;
}

/** The verdict from the CLI's stdout, or undefined when it is not one. */
export function parseVerdict(stdout: string): RecallVerdict | undefined {
	let json: unknown;
	try {
		json = JSON.parse(stdout);
	} catch {
		return undefined;
	}
	if (typeof json !== "object" || json === null) return undefined;
	const v = json as Record<string, unknown>;
	if (typeof v.search !== "boolean" || !Array.isArray(v.facts) || !v.facts.every(isFact)) return undefined;
	return { search: v.search, judged_by: String(v.judged_by ?? ""), facts: v.facts, note: typeof v.note === "string" ? v.note : null };
}

function formatScope(scope: ScopeWire): string {
	return typeof scope === "string" ? "global" : `project:${scope.Project}`;
}

/** The engine's BM25 recall marks hit terms with [match]…[/match]; the model must not see them. */
function oneLine(text: string): string {
	return text.replace(/\[match\]|\[\/match\]/g, "").replace(/\s+/g, " ").trim();
}

export type RecallContext = { text: string; ids: string[] };

/**
 * What to add to the prompt: the first facts (up to MAX_INJECTED) the session
 * has not seen. Anti-echo: `exclude` are ids already inserted — a fact the model
 * holds is pure token waste; the engine already left them out of the ranking,
 * this is defence in depth. No trigger or nothing new → undefined.
 */
export function buildRecallContext(verdict: RecallVerdict, exclude: ReadonlySet<string>): RecallContext | undefined {
	if (!verdict.search) return undefined;
	const facts = verdict.facts.filter((f) => !exclude.has(f.id)).slice(0, MAX_INJECTED);
	if (facts.length === 0) return undefined;
	const lines = facts.map((f) => `- [${f.fact_type}] ${oneLine(f.title)} (${formatScope(f.scope)}): ${oneLine(f.snippet)}`);
	return { text: `Paměť k tomuto úkolu (použij, kde je relevantní):\n${lines.join("\n")}`, ids: facts.map((f) => f.id) };
}

/** "1 faktum", "2 fakta", "5 faktů" — the one-line report. */
export function factCount(count: number): string {
	if (count === 1) return "1 faktum";
	return count >= 2 && count <= 4 ? `${count} fakta` : `${count} faktů`;
}
