import { describe, expect, test } from "claude-code/testing";
import { detectLanguageOrCode } from "./detect";

describe("language detection", () => {
	test("Czech typed without diacritics is not English", () => {
		const czech = [
			"ta instruakce pracvat v anglictine by ale nemela prichazetp ri kazdem promptu ne? to ti dam do claude.md atd",
			"nechci tam ten text, dej tomu nejake emoji",
			"to je dobre, ale jeste to oprav",
		];
		for (const text of czech) expect(detectLanguageOrCode(text).isEnglishOrCode, text).toBe(false);
	});
	test("English stays English", () => {
		for (const text of ["Please refactor the parser and add tests.", "add it to the config so it works by default"]) {
			expect(detectLanguageOrCode(text).isEnglishOrCode, text).toBe(true);
		}
	});
});
