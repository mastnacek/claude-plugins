// policy.ts — pure logic of staging: the `uma staging` calls, reading the drafts, turning a
// draft into the proposal the shared dialog shows, and the texts of `/uma staging …`.
// Running the processes and asking the person is the caller's job.

import type { PluginState, ShapedValue } from "claude-code";
import { PICK_BODY, PICK_FULL, PICK_TITLE, previewOf, wrap, WRAP_COLUMNS } from "../../shared/proposal";
import type { Proposal } from "../../shared/proposal";

type Out = ShapedValue<PluginState["cc-uma-memory"]["commandOutputs"]>[string];

/** What a subcommand answers: the line the model reads and, when there is more to show, the data uma-command draws. */
export type Result = { text: string; out?: Out };

/** One sentence, framed: the tone is the colour of the frame. */
export const sentence = (title: string, text: string, tone: Out["tone"] = "normal"): Result => ({ text, out: { title, tone, lines: [tone === "normal" ? { text } : { text, tone }] } });

/** A draft as `uma staging list --json` hands it over (the fields staging reads). */
export type Draft = {
	id: string;
	confidence: number;
	trigger: string;
	scope: string;
	type: string;
	title: string;
	body: string;
	tags: string[];
	template: string;
};

export const listArgv = (): string[] => ["uma", "staging", "list", "--json"];
export const discardArgv = (id: string): string[] => ["uma", "staging", "discard", id];

/**
 * `uma staging approve`: the engine takes only a title and a body as overrides (no tags,
 * no scope), and only those that differ from the draft are passed. `--title=value` keeps a
 * value that starts with a dash a value.
 */
export function approveArgv(id: string, edited: { title: string; body: string }, original: { title: string; body: string }): string[] {
	const argv = ["uma", "staging", "approve", id];
	if (edited.title !== original.title) argv.push(`--title=${edited.title}`);
	if (edited.body !== original.body) argv.push(`--body=${edited.body}`);
	return argv;
}

const str = (x: unknown): string => (typeof x === "string" ? x : "");

/** The scope as the draft stores it: `"Global"`, or `{ Project: "<name>" }`. */
function scopeOf(scope: unknown): string {
	if (typeof scope === "string") return scope;
	if (typeof scope === "object" && scope !== null) {
		const project = (scope as Record<string, unknown>).Project;
		if (typeof project === "string") return project;
	}
	return "";
}

/** The drafts in `uma staging list --json`; anything unreadable is skipped, a non-list is no drafts. */
export function parseDrafts(stdout: string): Draft[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) return [];
	const drafts: Draft[] = [];
	for (const raw of parsed as unknown[]) {
		if (typeof raw !== "object" || raw === null) continue;
		const r = raw as Record<string, unknown>;
		const fact = typeof r.fact === "object" && r.fact !== null ? (r.fact as Record<string, unknown>) : {};
		const provenance = typeof r.provenance === "object" && r.provenance !== null ? (r.provenance as Record<string, unknown>) : {};
		const id = str(r.id);
		if (!id) continue;
		drafts.push({
			id,
			confidence: typeof r.confidence === "number" ? r.confidence : 0,
			trigger: str(provenance.trigger_type),
			scope: scopeOf(fact.scope),
			type: str(fact.fact_type).toLowerCase(),
			title: str(fact.title),
			body: str(fact.body),
			tags: Array.isArray(fact.tags) ? fact.tags.filter((t): t is string => typeof t === "string") : [],
			template: str(fact.template),
		});
	}
	return drafts;
}

/** The draft as the shared dialog's proposal. A project scope shows as that project; a draft has no `since` / `oldId`. */
export function proposalOf(d: Draft, projectName: string): Proposal {
	const scope = d.scope === "" || d.scope.toLowerCase() === "project" ? projectName : d.scope;
	return { title: d.title, body: d.body, tags: d.tags, type: d.type, scope, initialScope: scope, projectName, supersedes: null, since: "", staleAfter: "", template: d.template };
}

export const percent = (confidence: number): string => `${Math.round(confidence * 100)} %`;

/** The main dialog's question: the shared preview, headed as a draft under review. */
export function questionOf(d: Draft, v: Proposal, index: number, total: number): string {
	const head = `📝 UMA • Koncept ${index + 1} z ${total} • spouštěč ${d.trigger || "?"} • jistota ${percent(d.confidence)}`;
	return previewOf(v).replace(/^[^\n]*/, head);
}

/** The edit menu's picks: a draft's tags cannot be changed (the engine's approve takes title and body only). */
export const EDIT_PICKS = [PICK_TITLE, PICK_BODY, PICK_FULL] as const;

/** Options the main dialog offers, besides the shared approve and reject. */
export const EDIT_DRAFT = "✏️ Upravit (název, obsah, celý text)";
export const SKIP_DRAFT = "⏭ Přeskočit (nechat na později)";

/** The summary after a review. */
export function reviewSummary(done: { approved: number; discarded: number; skipped: number; failed: number }, stopped: boolean): string {
	const parts = [`${done.approved} schváleno`, `${done.discarded} zahozeno`, `${done.skipped} ponecháno`];
	if (done.failed > 0) parts.push(`${done.failed} selhalo`);
	return `Kontrola konceptů${stopped ? " přerušena" : " dokončena"}: ${parts.join(", ")}.`;
}

export const NO_DRAFTS = "Žádné koncepty ke kontrole v .uma/.staging/";
export const noDrafts = (): Result => sentence("koncepty · žádné", NO_DRAFTS);

/** `/uma staging list`: a summary line for the model, one numbered entry per draft for the person. */
export function listResult(drafts: Draft[]): Result {
	if (drafts.length === 0) return noDrafts();
	const items = drafts.map((d) => {
		const item: NonNullable<Out["items"]>[number] = { title: d.title, id: d.id, score: percent(d.confidence), lines: [`spouštěč: ${d.trigger || "?"}`] };
		if (d.type) item.type = d.type;
		if (d.scope) item.scope = d.scope;
		if (d.tags.length > 0) item.tags = d.tags;
		return item;
	});
	return { text: `Koncepty: ${drafts.length} čeká na /uma review (výpis ukázán uživateli)`, out: { title: `koncepty · ${drafts.length} čeká na /uma review`, tone: "normal", items } };
}

/** `/uma staging show <id>`: a summary line, then the draft's fields and its whole body. */
export function showResult(d: Draft): Result {
	const lines = [`spouštěč: ${d.trigger || "?"}`];
	if (d.template) lines.push(`šablona (nespouští se): ${d.template}`);
	lines.push("", ...wrap(d.body || "(prázdné tělo)", WRAP_COLUMNS));
	const item: NonNullable<Out["items"]>[number] = { title: d.title, id: d.id, score: percent(d.confidence), lines };
	if (d.type) item.type = d.type;
	if (d.scope) item.scope = d.scope;
	if (d.tags.length > 0) item.tags = d.tags;
	return { text: `Koncept ${d.id}: ${d.title} (výpis ukázán uživateli)`, out: { title: `koncept · ${d.type || "?"}`, tone: "normal", items: [item] } };
}

export const USAGE = "Použití: /uma staging list | show <id> | discard <id>";

/** The ids the engine takes are ULIDs; anything else (a flag, a path) is refused before it reaches the argv. */
export const isDraftId = (id: string | undefined): id is string => id !== undefined && /^[0-9A-Za-z]{10,40}$/.test(id);
