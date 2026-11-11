// output.ts — the data of every /watch output (what `commandOutputs` carries) and the
// one line the model reads. Pure. Drawing is the report slice's.

import type { PluginState, ShapedValue } from "claude-code";
import type { LogFile } from "./store";
import type { Role, Rule, Verdict } from "./types";

export type Outputs = ShapedValue<PluginState["cc-agent-watchdog"]["commandOutputs"]>;
export type Out = Outputs[string];
export type Result = { text: string; out: Out };

const pad = (n: number): string => String(n).padStart(2, "0");

/** Local time of day, `13:05:09`. */
export function clock(ms: number): string {
	const d = new Date(ms);
	return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const sentence = (title: string, text: string, tone: Out["tone"] = "normal"): Result => ({ text, out: { title, tone, lines: [tone === "normal" ? { text } : { text, tone }] } });

/** `/watch report` for one session: score, every violation with time and evidence, counts. */
export function scorecard(v: Verdict, meta: { sid8: string; date?: string }): Result {
	const count = v.violations.length;
	const instants = v.violations.filter((x) => x.instant).length;
	const title = `${v.role} · ${meta.date ? `${meta.date} · ` : ""}${meta.sid8} · skóre ${v.score}/100`;
	const text = `Watchdog · sezení ${meta.sid8} (${v.role}): skóre ${v.score}/100, ${count === 0 ? "bez porušení" : `${count} porušení${instants > 0 ? `, ${instants}× instant failure` : ""}`}`;
	const lines: Out["lines"] = [];
	if (v.role === "orchestrator") lines.push({ text: "Orchestrátor: pravidla se na tuto roli nevztahují (hlídají se jen coder a tester).", tone: "dim" });
	for (const x of v.violations) {
		const mark = x.instant ? "⛔ INSTANT FAIL" : `⚠ −${x.points}`;
		lines.push({ text: `${mark} · ${x.rule} · ${clock(x.ts)} · ${x.evidence}`, tone: x.instant ? "error" : "warning" });
	}
	if (count === 0) lines.push({ text: "✔ žádné porušení", tone: "success" });
	const per = new Map<string, number>();
	for (const x of v.violations) per.set(x.rule, (per.get(x.rule) ?? 0) + 1);
	const off = v.violations.reduce((s, x) => s + x.points, 0);
	lines.push({ text: `Souhrn: ${v.calls} volání · ${count} porušení (${instants} instant) · odečet −${off}${per.size > 0 ? ` · ${[...per].map(([r, n]) => `${r}×${n}`).join(" ")}` : ""}`, tone: "dim" });
	const tone: Out["tone"] = instants > 0 ? "error" : count > 0 ? "warning" : "success";
	return { text, out: { title, tone, lines } };
}

/** `/watch report all`: one line per session. */
export function overview(rows: Array<{ file: Pick<LogFile, "date" | "sid8" | "role">; verdict: Verdict }>): Result {
	if (rows.length === 0) return sentence("přehled", "Watchdog · žádný deník sezení zatím nevznikl.", "warning");
	const lines: Out["lines"] = rows.map(({ file, verdict: v }) => ({
		text: `${v.instant ? "⛔" : v.violations.length > 0 ? "⚠" : "✔"} ${file.date} · ${file.role} · ${file.sid8} · skóre ${v.score} · ${v.calls} volání · ${v.violations.length} porušení`,
		tone: v.instant ? "error" : v.violations.length > 0 ? "warning" : "success",
	}));
	const failed = rows.filter((r) => r.verdict.instant).length;
	return { text: `Watchdog · ${rows.length} sezení, ${failed} s instant failure`, out: { title: `všechna sezení · ${rows.length}`, tone: failed > 0 ? "error" : "normal", lines } };
}

/** `/watch rules`: the active rules of a role. */
export function rulesOutput(role: Role, rules: readonly Rule[], notYet: readonly string[]): Result {
	const text = `Watchdog · ${rules.length} aktivních pravidel pro roli ${role}`;
	const lines: Out["lines"] = rules.map((r) => ({ text: `${r.id} · ${r.weight === "instant" ? "instant failure" : `−${r.weight}${r.cap ? ` (max −${r.cap})` : ""}`} · ${r.title}`, tone: r.weight === "instant" ? "error" : "warning" }));
	if (rules.length === 0) lines.push({ text: "Pro roli orchestrator žádná pravidla neplatí. Roli nastavuje CC_ROLE=coder|tester.", tone: "dim" });
	lines.push({ text: `Verze 2 (zatím neběží): ${notYet.join(" ")}`, tone: "dim" });
	return { text, out: { title: `pravidla · ${role}`, tone: "normal", lines } };
}
