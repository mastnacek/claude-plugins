import { describe, expect, test } from "claude-code/testing";
import { parseRule } from "./parse-rule";

describe("parseRule", () => {
	test("full rule", () => {
		const r = parseRule(
			[
				"id: BR-INV-014",
				"confidence: confirmed          # confirmed | inferred | gap",
				"source:",
				"  - file: legacy/a.bas",
				"    lines: \"1-2\"",
				"  - evidence: ev_1",
				"verified_by:",
				"  - tests/features/a.feature:12",
			].join("\n"),
		);
		expect(r).toEqual({ id: "BR-INV-014", confidence: "confirmed", source: 2, verifiedBy: 1 });
	});

	test("inline [] is empty, an empty block is empty", () => {
		const r = parseRule("id: A\nsource: []\nverified_by:\nglossary: [x]\n");
		expect(r.source).toBe(0);
		expect(r.verifiedBy).toBe(0);
	});

	test("inline list with content counts as one or more", () => {
		expect(parseRule("verified_by: [a.feature:1]").verifiedBy).toBe(1);
	});

	test("comments and blank lines do not count as items", () => {
		const r = parseRule("source:\n  # - file: x\n\nverified_by: []   # none yet\n");
		expect(r.source).toBe(0);
		expect(r.verifiedBy).toBe(0);
	});

	test("missing keys stay undefined; quotes stripped", () => {
		const r = parseRule('id: "BR-A-1"\n');
		expect(r.id).toBe("BR-A-1");
		expect(r.source).toBeUndefined();
		expect(r.verifiedBy).toBeUndefined();
		expect(r.confidence).toBeUndefined();
	});

	test("a list item of another key does not leak into verified_by", () => {
		const r = parseRule("glossary:\n  - a\n  - b\nverified_by: []\n");
		expect(r.verifiedBy).toBe(0);
	});

	test("unindented list items belong to their key", () => {
		expect(parseRule("source:\n- file: x\n").source).toBe(1);
	});
});
