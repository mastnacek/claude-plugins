import { expect, test } from "claude-code/testing";
import { formatRules, parseRules, rulesArgv } from "./policy";

test("argv lists active decisions and patterns as JSON", () => {
	expect(rulesArgv("decision")).toEqual(["uma", "list", "--json", "--type", "decision"]);
	expect(rulesArgv("pattern")).toEqual(["uma", "list", "--json", "--type", "pattern"]);
});

test("format matches pi's formatRulesForSystemPrompt: header, instruction, first body line", () => {
	const text = formatRules([
		{ id: "1", fact_type: "decision", title: "Use VSA", body: "Slices own their code.\nSecond line is dropped." },
		{ id: "2", fact_type: "pattern", title: "No body", body: "" },
	]);
	expect(text).toBe(
		[
			"## Project Memory & Architectural Rules (from UMA)",
			"Strictly follow these recorded decisions and patterns when implementing solutions:",
			"- [decision] Use VSA: Slices own their code.",
			"- [pattern] No body: ",
		].join("\n"),
	);
});

test("at most 10 rules; none → empty text", () => {
	const many = Array.from({ length: 14 }, (_, i) => ({ id: `I${i}`, fact_type: "decision", title: `T${i}`, body: "b" }));
	expect(formatRules(many).split("\n")).toHaveLength(2 + 10);
	expect(formatRules(many)).toContain("T9");
	expect(formatRules(many)).not.toContain("T10");
	expect(formatRules([])).toBe("");
});

test("parse: an array of facts, anything else is unreadable", () => {
	expect(parseRules('[{"id":"1","title":"A","fact_type":"decision","body":"x"}]')).toEqual([{ id: "1", title: "A", fact_type: "decision", body: "x" }]);
	expect(parseRules("[]")).toEqual([]);
	expect(parseRules("not json")).toBeUndefined();
	expect(parseRules('{"a":1}')).toBeUndefined();
});
