// output.ts — the data of every /watch output (what `commandOutputs` carries) and the
// one line the model reads. Pure. Drawing is the report slice's.

import type { PluginState, ShapedValue } from "claude-code";
import type { LogFile } from "./store";
import { factCount, factsAt, factsLine } from "./uma";
import type { UmaContext } from "./uma";
import { stateOf } from "./settings";
import type { Config, Role, Rule, Verdict } from "./types";
import { remaining } from "./waivers";
import type { Window } from "./waivers";

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
export function scorecard(v: Verdict, meta: { sid8: string; date?: string }, uma?: readonly UmaContext[]): Result {
	const count = v.violations.length;
	const instants = v.violations.filter((x) => x.instant).length;
	const title = `${v.role} · ${meta.date ? `${meta.date} · ` : ""}${meta.sid8} · skóre ${v.score}/100`;
	const text = `Watchdog · sezení ${meta.sid8} (${v.role}): skóre ${v.score}/100, ${count === 0 ? "bez porušení" : `${count} porušení${instants > 0 ? `, ${instants}× instant failure` : ""}`}`;
	const lines: Out["lines"] = [];
	if (v.role === "orchestrator") lines.push({ text: "Orchestrátor: pravidla se na tuto roli nevztahují (hlídají se jen coder a tester).", tone: "dim" });
	const rows = [...v.violations.map((x) => ({ ts: x.ts, x })), ...v.waived.map((w) => ({ ts: w.ts, w }))].sort((a, b) => a.ts - b.ts);
	for (const row of rows) {
		if ("w" in row) {
			lines.push({ text: `✅ povoleno výjimkou ${row.w.rule} (${clock(row.w.ts)}) · ${row.w.evidence} · „${row.w.reason}“`, tone: "success" });
			continue;
		}
		const x = row.x;
		const mark = x.instant ? "⛔ INSTANT FAIL" : `⚠ −${x.points}`;
		lines.push({ text: `${mark} · ${x.rule} · ${clock(x.ts)} · ${x.evidence}`, tone: x.instant ? "error" : "warning" });
		// The UMA facts the model had in context when it happened (only with the sidecar of cc-uma-memory).
		if (uma) lines.push({ text: `   ${factsLine(factsAt(uma, x.ts))}`, tone: "dim" });
	}
	if (count === 0) lines.push({ text: "✔ žádné porušení", tone: "success" });
	const per = new Map<string, number>();
	for (const x of v.violations) per.set(x.rule, (per.get(x.rule) ?? 0) + 1);
	const off = v.violations.reduce((s, x) => s + x.points, 0);
	lines.push({ text: `Souhrn: ${v.calls} volání · ${count} porušení (${instants} instant) · odečet −${off}${per.size > 0 ? ` · ${[...per].map(([r, n]) => `${r}×${n}`).join(" ")}` : ""}`, tone: "dim" });
	if (v.waivers.requested > 0) lines.push({ text: `výjimky: ${requests(v.waivers.requested)}, ${v.waivers.granted} povoleno, ${v.waivers.used} použito`, tone: "dim" });
	if (uma) lines.push({ text: `🧠 sezení mělo ${factCount(factsAt(uma).length)} UMA v kontextu`, tone: "dim" });
	const tone: Out["tone"] = instants > 0 ? "error" : count > 0 ? "warning" : "success";
	return { text, out: { title, tone, lines } };
}

/** Czech plural: 1 žádost, 2–4 žádosti, 0 and 5+ žádostí. */
export const requests = (n: number): string => `${n} ${n === 1 ? "žádost" : n >= 2 && n <= 4 ? "žádosti" : "žádostí"}`;

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

/** `/watch rules`: every rule with its weight, state (on / off), mode and where each comes from, then the open exceptions. */
export function rulesOutput(role: Role, rules: readonly Rule[], cfg: Config, notYet: readonly string[], open: readonly Window[]): Result {
	const on = rules.filter((r) => r.roles.includes(role) && stateOf(r, cfg).enabled).length;
	const text = `Watchdog · ${on} aktivních pravidel pro roli ${role}`;
	const lines: Out["lines"] = rules.map((r) => {
		const st = stateOf(r, cfg);
		const weight = r.weight === "instant" ? "⛔ instant" : `−${r.weight}${r.cap ? ` (max −${r.cap})` : ""}`;
		const mode = !st.blockable ? "jen report" : st.mode === "block" ? "🛑 block" : "report";
		// One source when the state and the mode come from the same layer, or one of them is the default.
		const [a, b] = [st.enabledFrom, st.modeFrom];
		const from = a === b || !st.blockable || b === "výchozí" ? a : a === "výchozí" ? b : `stav ${a}, režim ${b}`;
		const applies = r.roles.includes(role) ? "" : ` · (netýká se role ${role})`;
		return {
			text: `${st.enabled ? "🟢" : "⚪"} ${r.id} · ${weight} · ${st.enabled ? "zapnuto" : "vypnuto"} · ${mode} · zdroj: ${from}${applies} · ${r.title}`,
			tone: !st.enabled ? "dim" : r.weight === "instant" ? "error" : "warning",
		};
	});
	if (role === "orchestrator") lines.push({ text: "Orchestrátor: pravidla se na něj nevztahují (roli nastavuje CC_ROLE=coder|tester).", tone: "dim" });
	if (open.length === 0) lines.push({ text: "Výjimky v sezení: žádná otevřená.", tone: "dim" });
	for (const w of open) lines.push({ text: `✅ výjimka ${w.waiver.rule} · ${remaining(w)} · „${w.waiver.reason}“`, tone: "success" });
	lines.push({ text: `Verze 2 (zatím neběží): ${notYet.join(" ")}`, tone: "dim" });
	lines.push({ text: "Změna: /watch rule <id> on|off|report|block [--global]", tone: "dim" });
	return { text, out: { title: `pravidla · ${role}`, tone: "normal", lines } };
}
