import { describe, expect, test } from "claude-code/testing";
import { buildSection, MAX_CHARS } from "./section";

describe("buildSection", () => {
	test("short file: heading + text, session scope", () => {
		const s = buildSection("- Money is Decimal.\n");
		expect(s?.scope).toBe("session");
		expect(s?.text).toBe("# Project invariants (cc-reverse-spec)\n\n- Money is Decimal.");
	});

	test("empty file: nothing", () => {
		expect(buildSection("  \n")).toBeNull();
	});

	test("over 8 kB: cut and said so", () => {
		const s = buildSection("x".repeat(MAX_CHARS + 500));
		expect(s?.text).toContain("truncated");
		expect(s?.text.length).toBeLessThan(MAX_CHARS + 200);
	});

	test("exactly at the limit: not cut", () => {
		expect(buildSection("x".repeat(MAX_CHARS))?.text).not.toContain("truncated");
	});
});
