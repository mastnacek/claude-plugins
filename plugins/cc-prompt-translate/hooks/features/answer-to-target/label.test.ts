import { describe, expect, test } from "claude-code/testing";
import { translatedLabel } from "./label";

describe("translatedLabel", () => {
	test("the badge is in the target language, English for others", () => {
		expect(translatedLabel("Czech")).toBe("🌐️ Přeloženo");
		expect(translatedLabel("slovak")).toBe("🌐️ Preložené");
		expect(translatedLabel("Japanese")).toBe("🌐️ Translated");
	});
});
