import { describe, expect, test as it } from "claude-code/testing";
import { checkTranslationLength, MIN_CHECKED_CHARS, MIN_OUTPUT_RATIO } from "./length-check";

const P0 = "__PI_PROMPT_TRANSLATE_PROTECTED_0__";
const seg = (value: string) => [{ placeholder: P0, value }];
const text = (n: number) => "a".repeat(n);

describe("checkTranslationLength", () => {
	it("flags a reply under 50 % of an input of 400+ chars", () => {
		const v = checkTranslationLength(text(2000), text(131), []);
		expect(v).toEqual({ short: true, inChars: 2000, outChars: 131 });
	});

	it("boundaries: 400 chars is checked, 399 is not; exactly 50 % passes", () => {
		expect(checkTranslationLength(text(MIN_CHECKED_CHARS), text(10), []).short).toBe(true);
		expect(checkTranslationLength(text(MIN_CHECKED_CHARS - 1), text(10), []).short).toBe(false);
		expect(checkTranslationLength(text(1000), text(1000 * MIN_OUTPUT_RATIO), []).short).toBe(false);
		expect(checkTranslationLength(text(1000), text(1000 * MIN_OUTPUT_RATIO - 1), []).short).toBe(true);
	});

	it("does not count protected segments on either side", () => {
		const big = text(5000);
		// Input: 500 translatable chars + a placeholder; output: 100 chars + the restored block.
		const v = checkTranslationLength(`${text(500)} ${P0}`, `${text(100)} ${big}`, seg(big));
		expect(v.inChars).toBe(500);
		expect(v.outChars).toBe(100);
		expect(v.short).toBe(true);
	});

	it("a huge protected block does not push a short prompt over the threshold", () => {
		expect(checkTranslationLength(`${text(100)} ${P0}`, text(20), seg(text(9000))).short).toBe(false);
	});

	it("a faithful translation passes", () => {
		expect(checkTranslationLength(text(1000), text(800), []).short).toBe(false);
	});
});
