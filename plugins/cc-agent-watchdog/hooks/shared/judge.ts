// judge.ts — runs the rules over a ledger and adds up the score.
// Score = 100 − points; an instant failure makes it 0. Pure: events + config in, verdict out.

import { RULES } from "./rules";
import type { Config, Ev, Role, Rule, Verdict, Violation } from "./types";

/** The rules that apply to `role` in this project. */
export const activeRules = (role: Role, cfg: Config): Rule[] => RULES.filter((r) => r.roles.includes(role) && (!r.profile || cfg.profile.includes(r.id)));

/** The role a ledger was written under (the first line decides). */
export const roleOf = (events: readonly Ev[]): Role => events[0]?.role ?? "orchestrator";

export function evaluate(events: readonly Ev[], cfg: Config, role: Role = roleOf(events)): Verdict {
	const violations: Violation[] = [];
	for (const rule of activeRules(role, cfg)) {
		let spent = 0;
		for (const hit of rule.check(events, cfg)) {
			const instant = hit.instant ?? (rule.weight === "instant" && hit.points === undefined);
			const wanted = instant ? 0 : (hit.points ?? (typeof rule.weight === "number" ? rule.weight : 0));
			const points = rule.cap === undefined ? wanted : Math.max(0, Math.min(wanted, rule.cap - spent));
			spent += points;
			violations.push({ rule: rule.id, title: rule.title, ts: hit.ts, evidence: hit.evidence, points, instant });
		}
	}
	violations.sort((a, b) => a.ts - b.ts);
	const instant = violations.some((v) => v.instant);
	const off = violations.reduce((sum, v) => sum + v.points, 0);
	return { role, score: instant ? 0 : Math.max(0, 100 - off), instant, violations, calls: events.filter((e) => e.kind === "tool").length };
}

/** The tag under the prompt: `[👁 85]`, `[👁 85 ⚠2]`, `[👁 0 ⛔]`. */
export function badge(v: { score: number; instant: boolean; count: number }): string {
	if (v.instant) return "[👁 0 ⛔]";
	return `[👁 ${v.score}${v.count > 0 ? ` ⚠${v.count}` : ""}]`;
}
