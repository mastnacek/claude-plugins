import { describe, expect, test as it } from "claude-code/testing";
import { collapsePastedBlocks } from "./collapse";

const wrap = (body: string) => `<pasted_content id="x">\n${body}\n</pasted_content id="x">`;

describe("collapsePastedBlocks", () => {
	it("keeps the first 3 lines and counts the rest", () => {
		const out = collapsePastedBlocks(`Dotaz\n${wrap("1\n2\n3\n4\n5\n6\n7\n8")}`);
		expect(out).toBe('Dotaz\n<pasted_content id="x">\n1\n2\n3\n… (5 dalších řádků)\n</pasted_content id="x">');
	});

	it("leaves a short block and plain text untouched", () => {
		const short = wrap("1\n2\n3");
		expect(collapsePastedBlocks(short)).toBe(short);
		expect(collapsePastedBlocks("jen text\n1\n2\n3\n4\n5")).toBe("jen text\n1\n2\n3\n4\n5");
	});

	it("collapses each block separately and handles one hidden line", () => {
		const out = collapsePastedBlocks(`${wrap("a\nb\nc\nd")}\nx\n${wrap("e\nf\ng\nh\ni\nj")}`);
		expect(out).toContain("… (1 další řádek)");
		expect(out).toContain("… (3 další řádky)");
	});
});
