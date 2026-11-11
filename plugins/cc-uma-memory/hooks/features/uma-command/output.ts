// output.ts — pure: turns the engine's `--json` output of the read-only commands into the
// data `commandOutputs` carries (see types/index.d.ts), plus the one line the model reads.
// Where the engine has no JSON (`reindex`, `export`, `debt clear`) the output is one sentence.
// Drawing is register.tsx's; colours by meaning are classify.ts's.

import type { PluginState, ShapedValue } from "claude-code";

export type Outputs = ShapedValue<PluginState["cc-uma-memory"]["commandOutputs"]>;
export type Out = Outputs[string];
type Item = NonNullable<Out["items"]>[number];
type Field = NonNullable<Out["fields"]>[number];

/** What a subcommand answers: `text` is the line the model reads, `out` what the person sees (none = the text alone). */
export type Result = { text: string; out?: Out };

/** Czech plural: 1 fakt, 2–4 fakty, 5+ faktů. */
export const plural = (n: number, one: string, few: string, many: string): string => `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;

/** One sentence, framed: the tone is the frame's colour. */
export const sentence = (title: string, text: string, tone: Out["tone"] = "normal"): Result => ({ text, out: { title, tone, lines: [tone === "normal" ? { text } : { text, tone }] } });
export const failure = (text: string): Result => sentence("chyba", text, "error");
export const usage = (text: string): Result => sentence("použití", text, "warning");

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown): string => (typeof x === "string" ? x : "");
const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((t): t is string => typeof t === "string") : []);

function parse(stdout: string): unknown {
	try {
		return JSON.parse(stdout);
	} catch {
		return undefined;
	}
}

/** The engine's own text as the person's output when its JSON cannot be read: the model gets a count, the person the lines. */
function raw(what: string, stdout: string): Result {
	const body = stdout.trimEnd();
	if (!body) return empty(what);
	const lines = body.split("\n");
	return { text: `${what}: ${lines.length} řádků výpisu (ukázán uživateli)`, out: { title: what, tone: "normal", lines: lines.map((text) => ({ text })) } };
}

const empty = (what: string): Result => ({ text: `${what}: nic nenalezeno`, out: { title: `${what} · nic nenalezeno`, tone: "normal", lines: [{ text: "nic nenalezeno" }] } });

/** `project:claude-plugins`, `"Global"` or `{ Project: "x" }` → one label. */
function scopeOf(scope: unknown): string {
	if (typeof scope === "string") return scope.toLowerCase() === "global" ? "global" : scope;
	if (isRecord(scope) && typeof scope.Project === "string") return `project:${scope.Project}`;
	return "";
}

function factItem(f: Record<string, unknown>, extra: Partial<Item> = {}): Item {
	const status = str(f.status).toLowerCase();
	const item: Item = { title: str(f.title) || "(bez názvu)", ...extra };
	const type = str(f.fact_type).toLowerCase();
	if (type) item.type = type;
	const scope = scopeOf(f.scope);
	if (scope) item.scope = scope;
	if (str(f.id)) item.id = str(f.id);
	const tags = strings(f.tags);
	if (tags.length > 0) item.tags = tags;
	if (status && status !== "stable" && status !== "active") item.badge = { text: status, tone: status === "deprecated" || status === "superseded" ? "dim" : undefined };
	return item;
}

/** `uma search --json`: `{ hits: [{ fact_type, scope, id, title, score, status, tags }], degraded, note }`. */
export function searchOutput(query: string, stdout: string): Result {
	const what = `Hledání „${query}“`;
	const data = parse(stdout);
	if (!isRecord(data) || !Array.isArray(data.hits)) return raw(what, stdout);
	const hits = data.hits.filter(isRecord);
	const degraded = data.degraded === true;
	const note = str(data.note);
	if (hits.length === 0) {
		const r = empty(what);
		if (note && r.out) r.out.lines = [...(r.out.lines ?? []), { text: note }];
		return r;
	}
	const items = hits.map((h) => factItem(h, typeof h.score === "number" ? { score: h.score.toFixed(3) } : {}));
	const lines: NonNullable<Out["lines"]> = [];
	if (note) lines.push({ text: note, tone: degraded ? "warning" : "dim" });
	else if (degraded) lines.push({ text: "Hledání proběhlo ve zhoršeném režimu.", tone: "warning" });
	return {
		text: `${what}: ${plural(hits.length, "výsledek", "výsledky", "výsledků")} (výpis ukázán uživateli)`,
		out: { title: `hledání „${query}“ · ${plural(hits.length, "výsledek", "výsledky", "výsledků")}`, tone: degraded ? "warning" : "normal", items, ...(lines.length > 0 ? { lines } : {}) },
	};
}

/** `uma list --json`: an array of facts. */
export function listOutput(what: string, stdout: string): Result {
	const data = parse(stdout);
	if (!Array.isArray(data)) return raw(what, stdout);
	const facts = data.filter(isRecord);
	if (facts.length === 0) return empty(what);
	const n = plural(facts.length, "fakt", "fakty", "faktů");
	return { text: `${what}: ${n} (výpis ukázán uživateli)`, out: { title: `${what.toLowerCase()} · ${n}`, tone: "normal", items: facts.map((f) => factItem(f)) } };
}

/** `uma read --json`: one fact with its whole body. */
export function readOutput(id: string, stdout: string): Result {
	const what = `Fakt ${id}`;
	const data = parse(stdout);
	if (!isRecord(data)) return raw(what, stdout);
	const body = str(data.body);
	const item = factItem(data, body ? { lines: body.split("\n") } : {});
	return { text: `${what}: ${item.title} (výpis ukázán uživateli)`, out: { title: `fakt · ${item.type ?? "?"}`, tone: "normal", items: [item] } };
}

const clock = (v: unknown): string => str(v).slice(0, 16).replace("T", " ");

/** `uma timeline --json`: chains `[{ current, revisions: [{ id, title, status, since, until, revised_at }] }]`. */
export function timelineOutput(stdout: string): Result {
	const what = "Vývoj faktů";
	const data = parse(stdout);
	if (!Array.isArray(data)) return raw(what, stdout);
	const chains = data.filter(isRecord);
	const items: Item[] = [];
	chains.forEach((c, ci) => {
		const revisions = Array.isArray(c.revisions) ? c.revisions.filter(isRecord) : [];
		for (const r of revisions) {
			const current = str(c.current) !== "" && str(r.id) === str(c.current);
			const status = str(r.status).toLowerCase();
			const item: Item = { title: str(r.title) || "(bez názvu)", id: str(r.id), lines: [`řetěz ${ci + 1} · ${clock(r.revised_at)}${str(r.until) ? ` → ${clock(r.until)}` : ""}`] };
			if (current) item.badge = { text: "aktuální", tone: "success" };
			else if (status) item.badge = { text: status, tone: status === "deprecated" || status === "superseded" ? "dim" : undefined };
			items.push(item);
		}
	});
	if (items.length === 0) return empty(what);
	const n = `${plural(chains.length, "řetěz", "řetězy", "řetězů")}, ${plural(items.length, "revize", "revize", "revizí")}`;
	return { text: `${what}: ${n} (výpis ukázán uživateli)`, out: { title: `vývoj faktů · ${n}`, tone: "normal", items } };
}

/** `uma doctor --json`: `{ findings: [{ check, detail, level, remedy }], warnings, failed }`. */
export function doctorOutput(stdout: string): Result {
	const what = "Zpráva uma doctor";
	const data = parse(stdout);
	if (!isRecord(data) || !Array.isArray(data.findings)) return raw(what, stdout);
	const findings = data.findings.filter(isRecord);
	if (findings.length === 0) return empty(what);
	const level = (f: Record<string, unknown>): Field["tone"] => {
		const l = str(f.level).toLowerCase();
		return /fail|err/.test(l) ? "error" : /warn/.test(l) ? "warning" : l === "ok" ? "success" : undefined;
	};
	const fields: Field[] = findings.map((f) => {
		const field: Field = { label: str(f.check), value: str(f.detail) };
		const tone = level(f);
		if (tone) field.tone = tone;
		if (str(f.remedy)) field.hint = `→ ${str(f.remedy)}`;
		return field;
	});
	const failed = findings.filter((f) => level(f) === "error").length;
	const warnings = findings.filter((f) => level(f) === "warning").length;
	const summary = `${plural(findings.length, "kontrola", "kontroly", "kontrol")}: ${plural(warnings, "varování", "varování", "varování")}, ${plural(failed, "selhání", "selhání", "selhání")}`;
	return {
		text: `${what}: ${summary} (výpis ukázán uživateli)`,
		out: { title: `zdraví úložiště · ${summary}`, tone: failed > 0 ? "error" : warnings > 0 ? "warning" : "success", fields, lines: [{ text: "Nic se nezměnilo (jen čtení).", tone: "dim" }] },
	};
}

/** `uma debt list --all --json`: `[{ id, sourceAction, requiredAction, blocking, origin, createdAt, settledAt }]`. */
export function debtOutput(stdout: string): Result {
	const data = parse(stdout);
	if (!Array.isArray(data)) return failure("uma debt list vrátila nečitelnou odpověď");
	const debts = data.filter(isRecord);
	if (debts.length === 0) return { text: "Dluhy: žádné", out: { title: "dluhy · žádné", tone: "normal", lines: [{ text: "žádné dluhy" }] } };
	const open = debts.filter((d) => !d.settledAt);
	const blocking = open.filter((d) => d.blocking).length;
	const items: Item[] = debts.map((d) => ({
		title: `${str(d.sourceAction)} → ${str(d.requiredAction)}`,
		id: str(d.id),
		badge: d.settledAt ? { text: `vyrovnán ${clock(d.settledAt)}`, tone: "success" } : d.blocking ? { text: "BLOKUJÍCÍ", tone: "warning" } : { text: "neblokující", tone: "dim" },
		lines: [`${str(d.origin)} · ${clock(d.createdAt)}`],
	}));
	const summary = `otevřených ${open.length} (blokujících ${blocking}), vyrovnaných ${debts.length - open.length}`;
	return { text: `Dluhy: ${summary} (výpis ukázán uživateli)`, out: { title: `dluhy · ${summary}`, tone: blocking > 0 ? "warning" : "normal", items } };
}

/** The help: the first line is the model's, each command a label/value row. */
export function helpOutput(rows: ReadonlyArray<readonly [string, string]>): Result {
	const head = "/uma — paměť UMA";
	return { text: head, out: { title: "nápověda", tone: "normal", fields: rows.map(([label, value]) => ({ label, value })) } };
}

/** A text a subcommand answered as lines (settings switches): one line stays as it is, several become a framed output. */
export function fromText(text: string, classifyTone: (line: string) => "error" | "warning" | "success" | undefined): Result {
	const output = text.trimEnd();
	const [summary = "", ...rest] = output.split("\n");
	if (rest.length === 0) return { text: summary };
	return { text: summary, out: { title: summary, tone: classifyTone(summary) ?? "normal", lines: output.split("\n").map((line) => ({ text: line })) } };
}
