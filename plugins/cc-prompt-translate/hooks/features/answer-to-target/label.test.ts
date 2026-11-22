import { describe, expect, test } from "claude-code/testing";
import { translatedLabel, withLabel } from "./label";

describe("translatedLabel", () => {
	test("the marker is in the target language, English for others", () => {
		expect(translatedLabel("Czech")).toBe("🌐 *Přeloženo:*");
		expect(translatedLabel("slovak")).toBe("🌐 *Preložené:*");
		expect(translatedLabel("Japanese")).toBe("🌐 *Translated:*");
	});

	test("the marker sits on its own line above the translation", () => {
		expect(withLabel("Ahoj.", "Czech")).toBe("🌐 *Přeloženo:*\n\nAhoj.");
	});
});
