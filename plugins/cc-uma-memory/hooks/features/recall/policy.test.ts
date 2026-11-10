import { expect, test } from "claude-code/testing";
import { buildRecallContext, factCount, parseVerdict, recallArgv } from "./policy";
import type { RecallFact, RecallVerdict } from "./policy";

const fact = (id: string, over: Partial<RecallFact> = {}): RecallFact => ({
	id,
	title: `Fact ${id}`,
	fact_type: "decision",
	scope: { Project: "app" },
	snippet: `Snippet ${id}`,
	...over,
});
const verdict = (facts: RecallFact[], search = true): RecallVerdict => ({ search, judged_by: "jev", facts, note: null });

test("context: header and one line per fact — type, title, scope, snippet", () => {
	const ctx = buildRecallContext(verdict([fact("A"), fact("B", { scope: "Global", fact_type: "note" })]), new Set());
	expect(ctx?.text).toBe(
		"Paměť k tomuto úkolu (použij, kde je relevantní):\n- [decision] Fact A (project:app): Snippet A\n- [note] Fact B (global): Snippet B",
	);
	expect(ctx?.ids).toEqual(["A", "B"]);
});

test("context: match markers and line breaks never reach the model", () => {
	const ctx = buildRecallContext(verdict([fact("A", { snippet: "…[match]sync[/match]\n is   git-based…", title: "[match]Sync[/match]" })]), new Set());
	expect(ctx?.text).toContain("- [decision] Sync (project:app): …sync is git-based…");
	expect(ctx?.text).not.toContain("[match]");
});

test("no trigger, no facts → nothing", () => {
	expect(buildRecallContext(verdict([fact("A")], false), new Set())).toBeUndefined();
	expect(buildRecallContext(verdict([]), new Set())).toBeUndefined();
});

test("anti-echo: facts already inserted are left out and the budget fills with the next ones", () => {
	const six = ["A", "B", "C", "D", "E", "F"].map((id) => fact(id));
	const ctx = buildRecallContext(verdict(six), new Set(["A", "B"]));
	expect(ctx?.ids).toEqual(["C", "D", "E"]);
	expect(ctx?.text).not.toContain("Fact A");
});

test("anti-echo: all facts already inserted → nothing", () => {
	expect(buildRecallContext(verdict([fact("A")]), new Set(["A"]))).toBeUndefined();
});

test("argv: judge jev, max 3, excludes before the prompt, a dash prompt stays an argument", () => {
	expect(recallArgv("- fix the list", ["01A", "01B"])).toEqual([
		"uma", "recall", "check", "--judge", "jev", "--json", "--max", "3", "--exclude", "01A", "--exclude", "01B", "--", "- fix the list",
	]);
	expect(recallArgv("x".repeat(5000), []).at(-1)?.length).toBe(2000);
});

test("verdict: only well-formed JSON counts", () => {
	expect(parseVerdict(JSON.stringify({ search: true, judged_by: "jev", facts: [fact("A")], note: null }))?.facts.length).toBe(1);
	expect(parseVerdict("not json")).toBeUndefined();
	expect(parseVerdict("{}")).toBeUndefined();
	expect(parseVerdict(JSON.stringify({ search: true, facts: [{ id: 1 }] }))).toBeUndefined();
});

test("Czech plural of the one-line report", () => {
	expect(factCount(1)).toBe("1 faktum");
	expect(factCount(2)).toBe("2 fakta");
	expect(factCount(3)).toBe("3 fakta");
	expect(factCount(5)).toBe("5 faktů");
});
