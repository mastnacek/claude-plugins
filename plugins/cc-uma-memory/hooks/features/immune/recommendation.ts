// recommendation.ts — pure part of the semantic second opinion in the dialog
// (port of pi's slices/immune/recommendation.ts, Czech only): the prompt, the
// defensive parser, the line shown. The question itself goes through
// shared/openrouter; this file knows no `$`.
//
// Advisory only: it never approves and never blocks.

export type Relation = "violates" | "touches" | "unrelated";
export type Recommendation = { relation: Relation; confidence: number; reason: string };

const RELATIONS: readonly Relation[] = ["violates", "touches", "unrelated"];
const MAX_RULE_BODY_CHARS = 2500;
const MAX_ADDED_CHARS = 4000;

/** The model the recommendation asks unless the person chose another (`/uma immune-model`). */
export const DEFAULT_MODEL = "google/gemini-3.5-flash-lite";

/** Deadline of the recommendation: later than this it is worse than none. */
export const RECOMMENDATION_TIMEOUT_MS = 8000;

export function buildPrompt(rule: { title: string; body: string }, addedText: string): { system: string; user: string } {
	const body = rule.body.length > MAX_RULE_BODY_CHARS ? `${rule.body.slice(0, MAX_RULE_BODY_CHARS)}…` : rule.body;
	const added = addedText.length > MAX_ADDED_CHARS ? `${addedText.slice(0, MAX_ADDED_CHARS)}…` : addedText;
	const system = [
		"You are a fast compliance classifier for an AI memory system.",
		'Answer ONLY with a strict JSON object: {"relation":"violates"|"touches"|"unrelated","confidence":<number 0..1>,"reason":"<one sentence>"}.',
		"No prose, no markdown, no code fence.",
		"Decide how the ADDED TEXT being saved relates to the MEMORY RULE:",
		"- violates: it would break or contradict what the rule prescribes;",
		"- touches: it works on the same topic but does not contradict the rule;",
		"- unrelated: the overlap is only vocabulary, the rule is not at risk.",
		"Be conservative about violates: it requires a concrete contradiction, not topic proximity.",
		"Write the reason sentence in Czech.",
	].join(" ");
	const user = [`MEMORY RULE "${rule.title}":`, body, "", "ADDED TEXT being saved:", added].join("\n");
	return { system, user };
}

/** Defensive against a chatty model: fenced JSON, first object, validated relation, clamped confidence. */
export function parseRecommendation(raw: string): Recommendation | undefined {
	if (!raw) return undefined;
	const start = raw.indexOf("{");
	const end = raw.lastIndexOf("}");
	if (start < 0 || end <= start) return undefined;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw.slice(start, end + 1));
	} catch {
		return undefined;
	}
	if (typeof parsed !== "object" || parsed === null) return undefined;
	const record = parsed as Record<string, unknown>;
	const relation = record.relation;
	if (typeof relation !== "string" || !RELATIONS.includes(relation as Relation)) return undefined;
	const c = record.confidence;
	const confidence = typeof c === "number" && Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0.5;
	const reason = typeof record.reason === "string" ? record.reason.trim() : "";
	return { relation: relation as Relation, confidence, reason };
}

const TEMPLATES: Record<Relation, string> = {
	unrelated: "🧠 Jev: nesouvisí s jádrem pravidla ({p} %) — doporučuji Ano",
	touches: "🧠 Jev: dotýká se tématu pravidla ({p} %) — přečti si pravidlo",
	violates: "🧠 Jev: nejspíš porušuje pravidlo ({p} %) — doporučuji Ne",
};

/** The lines appended to the dialog question. */
export function formatRecommendation(rec: Recommendation): string {
	const lines = [TEMPLATES[rec.relation].replace("{p}", String(Math.round(rec.confidence * 100)))];
	if (rec.reason) lines.push(`  „${rec.reason}“`);
	return lines.join("\n");
}
