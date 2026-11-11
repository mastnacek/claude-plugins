// policy.ts — assessEdit and its thresholds are pi's (test/immune.test.ts), the rest is the port's glue.

import { expect, test } from "claude-code/testing";
import type { ContractBreach } from "./contracts";
import { assessEdit, decideAction, extractEdit, isStorePath, oneLine, parsePain, parseRules, worthDialog } from "./policy";
import type { PainVerdict, RuleL1 } from "./policy";

const pain = (score: number, band: PainVerdict["band"]): PainVerdict => ({ score, band });

const vsaRule: RuleL1 = {
	id: "01M4D7S5",
	title: "Strict Vertical Slice Architecture",
	fact_type: "decision",
	body: "Feature slices never import each other directly. Shared contracts flow through uma-core or src/shared.",
};

test("low pain and no rule overlap produces no warnings", () => {
	expect(assessEdit(pain(5, "low"), [vsaRule], "const x = 1 + 2;")).toEqual([]);
});

test("medium and critical pain warn with guidance", () => {
	const medium = assessEdit(pain(40, "medium"), [], "code");
	expect(medium).toHaveLength(1);
	expect(medium[0]).toContain("40/100");
	expect(medium[0]).toContain("run the affected tests");
	const critical = assessEdit(pain(85, "critical"), [], "code");
	expect(critical).toHaveLength(1);
	expect(critical[0]).toContain("test-first");
});

test("an edit genuinely touching a rule's vocabulary warns once (live fixture)", () => {
	const added =
		"The change mirrors rule vocabulary on purpose: feature slices never import each other directly; shared contracts flow through the shared kernel instead of slice-to-slice imports.";
	const warnings = assessEdit(pain(0, "low"), [vsaRule], added);
	expect(warnings).toHaveLength(1);
	expect(warnings[0]).toContain(vsaRule.id);
	expect(warnings[0]).toContain(vsaRule.title);
});

test("benign edits sharing a few words stay silent (live fixtures)", () => {
	const doc = "Revision history is dated by each fact's generated.at (see the timeline); the claim's since passes through untouched.";
	expect(assessEdit(pain(0, "low"), [vsaRule], doc)).toEqual([]);
	expect(assessEdit(pain(0, "low"), [vsaRule], "One-page synthesis of what exists today and what comes next.")).toEqual([]);
	expect(assessEdit(pain(0, "low"), [vsaRule], "const x = 1 + 2; // scratch")).toEqual([]);
});

test("rule warnings stop at one per edit", () => {
	const second: RuleL1 = { ...vsaRule, id: "01OTHER", title: "Another overlapping rule about slices and kernel" };
	const warnings = assessEdit(pain(0, "low"), [vsaRule, second], "slices kernel import shared directly across the modules");
	expect(warnings.filter((w) => w.includes("[UMA Rule]"))).toHaveLength(1);
});

test("extractEdit reads Write, Edit and NotebookEdit; anything else is not an edit", () => {
	expect(extractEdit({ tool: "Write", file_path: "/a.rs", content: "fn main() {}" })).toEqual({ path: "/a.rs", added: "fn main() {}" });
	expect(extractEdit({ tool: "Edit", file_path: "/b.rs", old_string: "a", new_string: "second" })).toEqual({ path: "/b.rs", added: "second" });
	expect(extractEdit({ tool: "NotebookEdit", notebook_path: "/n.ipynb", new_source: "x = 1" })).toEqual({ path: "/n.ipynb", added: "x = 1" });
	expect(extractEdit({ tool: "NotebookEdit", notebook_path: "/n.ipynb", new_source: "", edit_mode: "delete" })).toBeUndefined();
	expect(extractEdit({ tool: "Read", file_path: "/c.rs" })).toBeUndefined();
	expect(extractEdit({ tool: "Bash", command: "ls" })).toBeUndefined();
	expect(extractEdit({ tool: "Write", content: "no path" })).toBeUndefined();
});

test("a path in the UMA store is not an edit for immune (write-gate guards it)", () => {
	expect(extractEdit({ tool: "Write", file_path: "/w/.uma/decision/x.md", content: "x" })).toBeUndefined();
	expect(extractEdit({ tool: "Edit", file_path: "/home/u/.local/share/uma/global/f.md", old_string: "a", new_string: "b" })).toBeUndefined();
	expect(isStorePath("/w/src/.umax/a.ts")).toBe(false);
	expect(isStorePath("C:\\w\\.uma\\a.md")).toBe(true);
});

test("no warnings means allow in every mode", () => {
	for (const mode of ["off", "warn", "ask", "auto"] as const) expect(decideAction(mode, [])).toEqual({ kind: "allow" });
});

const breach: ContractBreach = {
	factId: "01M4D7S5",
	title: "Strict Vertical Slice Architecture",
	ruleMessage: "Inviolable VSA Rule: Slices must NEVER import each other directly!",
	severity: "deny",
	pattern: "use crate::slices::$$$REST;",
	file: "src/slices/search/outcome.rs",
};

test("auto blocks a verified deny contract; ask asks; warn notifies; off allows", () => {
	const auto = decideAction("auto", [], [breach]);
	expect(auto.kind).toBe("block");
	if (auto.kind === "block") {
		expect(auto.reason).toContain("[UMA Immune System Block]");
		expect(auto.reason).toContain("01M4D7S5");
		expect(auto.reason).toContain("Inviolable VSA Rule");
	}
	expect(decideAction("ask", [], [breach]).kind).toBe("confirm");
	expect(decideAction("warn", [], [breach]).kind).toBe("notify");
	expect(decideAction("off", [], [breach]).kind).toBe("allow");
});

test("a warn-severity breach (also a degraded deny) never blocks, even in auto: it asks", () => {
	const degraded: ContractBreach = { ...breach, severity: "warn" };
	expect(decideAction("auto", [], [degraded]).kind).toBe("confirm");
	expect(decideAction("warn", [], [degraded]).kind).toBe("notify");
});

test("heuristic warnings: warn notifies, ask and auto ask — never a block", () => {
	expect(decideAction("warn", ["w"]).kind).toBe("notify");
	expect(decideAction("ask", ["w"]).kind).toBe("confirm");
	expect(decideAction("auto", ["w"]).kind).toBe("confirm");
});

test("a dialog is worth it for a rule, a contract or pain >= 50", () => {
	expect(worthDialog(pain(40, "medium"), undefined, [])).toBe(false);
	expect(worthDialog(pain(50, "medium"), undefined, [])).toBe(true);
	expect(worthDialog(undefined, vsaRule, [])).toBe(true);
	expect(worthDialog(undefined, undefined, [breach])).toBe(true);
});

test("parsers: pain and rules out of uma's JSON, junk is nothing", () => {
	expect(parsePain('{"score":20,"band":"low","churn":10}')).toEqual({ score: 20, band: "low" });
	expect(parsePain("not json")).toBeUndefined();
	expect(parsePain('{"score":1,"band":"weird"}')).toBeUndefined();
	expect(parseRules(JSON.stringify([vsaRule, { id: 1 }]))).toEqual([vsaRule]);
	expect(parseRules("{}")).toEqual([]);
	expect(parseRules("x")).toEqual([]);
});

test("oneLine joins lines for $.ui.log", () => {
	expect(oneLine("a\nb\n\nc")).toBe("a · b · c");
});
