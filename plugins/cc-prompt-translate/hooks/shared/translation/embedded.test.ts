/**
 * Pasted blocks (`<pasted_content id="x">…</pasted_content id="x">`) are opaque
 * to the translator — a boost prompt once dropped a whole one.
 */
import { describe, expect, test as it } from "claude-code/testing";
import { protectFinalAnswerSegments, protectPromptSegments, restoreProtectedSegments } from "./protect";

const block = '<pasted_content id="ab12">\nEnglish text, drop filler.\nSecond line.\n</pasted_content id="ab12">';

describe("pasted_content protection", () => {
	it("masks a block whose closing tag carries an attribute, and restores it", () => {
		const prompt = `Co to je?\n${block}`;
		const { text, segments } = protectPromptSegments(prompt);
		expect(text).not.toContain("English text");
		expect(segments).toHaveLength(1);
		expect(segments[0]?.value).toBe(block);
		expect(restoreProtectedSegments(text, segments)).toBe(prompt);
	});

	it("also masks a block with a plain closing tag", () => {
		const plain = "<pasted_content>abc</pasted_content>";
		expect(protectPromptSegments(plain).segments[0]?.value).toBe(plain);
	});

	it("keeps two blocks apart", () => {
		const two = `${block}\nmezi\n${block.replace(/ab12/g, "cd34")}`;
		expect(protectPromptSegments(two).segments).toHaveLength(2);
	});

	it("is prompt-only: an answer is not treated as embedded", () => {
		expect(protectFinalAnswerSegments(block).segments).toHaveLength(0);
	});
});
