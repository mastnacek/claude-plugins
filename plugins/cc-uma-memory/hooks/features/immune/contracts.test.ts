// contracts.ts — the pure half of the ast-grep check (pi's cases, minus the process).

import { expect, test } from "claude-code/testing";
import { applicableRules, breachOf, languageOf, outcomeOfScan, pathMatchesInside, patternBlindSpot, ruleYaml, scanArgv } from "./contracts";
import type { ContractRule } from "./contracts";

const rule: ContractRule = {
	id: "01M4D7S5",
	title: "Strict Vertical Slice Architecture",
	fact_type: "decision",
	body: "Slices must never import each other.",
	contract: { engine: "ast-grep", severity: "deny", rule: { pattern: "use crate::slices::doctor::checks::inspect_index;", inside: "src/slices/**", message: "Inviolable VSA Rule", language: "rust" } },
};

test("a rule applies only inside its glob; no contract, no rule", () => {
	expect(applicableRules([rule], "uma-cli/src/slices/search/outcome.rs")).toHaveLength(1);
	expect(applicableRules([rule], "uma-cli/src/main.rs")).toHaveLength(0);
	expect(applicableRules([{ ...rule, contract: null }], "src/slices/a.rs")).toHaveLength(0);
});

test("globs: wildcard, and a metacharacter glob cannot hang", () => {
	expect(pathMatchesInside("src/*.rs", "src/a.rs")).toBe(true);
	expect(pathMatchesInside("src/*.rs", "src/x/a.rs")).toBe(false);
	expect(pathMatchesInside("(a+)+*", "aaaaaaaaaaaaaaaaaaaaaaaaaaaa!")).toBe(false);
});

test("language: the contract's own, else the extension, else unknown", () => {
	expect(languageOf(rule.contract, "x.ts")).toBe("rust");
	expect(languageOf({ rule: { pattern: "p" } }, "src/a.tsx")).toBe("typescript");
	expect(languageOf({ rule: { pattern: "p" } }, "proc.plt")).toBeUndefined();
});

test("blind-spot pattern degrades visibly instead of matching nothing", () => {
	const blind = patternBlindSpot("use crate::slices::$$$REST;");
	expect(blind).toContain("path segment");
	const breach = breachOf(rule, "f.rs", { matched: false, degraded: blind });
	expect(breach?.severity).toBe("warn");
	expect(breach?.ruleMessage).toContain("DEGRADED");
	expect(patternBlindSpot('foo("$A")')).toContain("string literal");
	expect(patternBlindSpot("plt_call($$$ARGS)")).toBeUndefined();
});

test("the inline rule is one YAML, the added text goes in on stdin (no files)", () => {
	const yaml = ruleYaml(rule, "rust") as string;
	expect(yaml).toContain("id: uma-01m4d7s5");
	expect(yaml).toContain("severity: error");
	expect(yaml).toContain('pattern: "use crate::slices::doctor::checks::inspect_index;"');
	expect(ruleYaml({ ...rule, contract: { ...rule.contract, rule: { pattern: "a\nb" } } }, "rust")).toBeUndefined();
	expect(scanArgv("ast-grep", yaml)).toEqual(["ast-grep", "scan", "--stdin", "--inline-rules", yaml, "--json=compact"]);
});

test("scan outcomes: a hit (exit 1 is success), clean, a failed run, junk", () => {
	const hit = JSON.stringify([{ ruleId: "uma-01m4d7s5", lines: "use …" }]);
	expect(outcomeOfScan(rule, 1, hit)).toEqual({ matched: true });
	expect(breachOf(rule, "f.rs", { matched: true })?.severity).toBe("deny");
	expect(outcomeOfScan(rule, 0, "[]")).toEqual({ matched: false });
	expect(breachOf(rule, "f.rs", { matched: false })).toBeUndefined();
	expect(outcomeOfScan(rule, 8, "").degraded).toContain("failed");
	expect(outcomeOfScan(rule, 1, "{oops").degraded).toContain("unparsable");
	expect(outcomeOfScan(rule, 1, JSON.stringify([{ ruleId: "other" }]))).toEqual({ matched: false });
});
