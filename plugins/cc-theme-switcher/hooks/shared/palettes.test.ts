import { describe, expect, test } from "claude-code/testing";
import type { PaletteColors } from "./palettes";
import { baseOnlyTheme, buildOverrides, buildTheme, isHexColor, mix, PALETTE_NAMES, PALETTES, THEME_TOKENS } from "./palettes";

describe("mix", () => {
	test("t = 0 gives the first colour, t = 1 the second", () => {
		expect(mix("#102030", "#ffffff", 0)).toBe("#102030");
		expect(mix("#102030", "#ffffff", 1)).toBe("#ffffff");
	});

	test("half-way averages every channel", () => {
		expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
		expect(mix("#d8a657", "#928374", 0.5)).toBe("#b59566");
	});

	test("anything but #rrggbb leaves the first colour alone", () => {
		expect(mix("#d8a657", "", 0.5)).toBe("#d8a657");
		expect(mix("okhsl(1 2% 3%)", "#ffffff", 0.5)).toBe("okhsl(1 2% 3%)");
	});
});

describe("palettes", () => {
	test("the five bundled palettes", () => {
		expect([...PALETTE_NAMES].sort()).toEqual(["tts-dawn", "tts-day", "tts-dusk", "tts-night", "tts-osaka-jade"]);
	});

	test("every palette has every token as a valid #rrggbb", () => {
		for (const name of PALETTE_NAMES) {
			const theme = buildTheme(name);
			expect(theme, name).toBeDefined();
			for (const token of THEME_TOKENS) {
				expect(isHexColor(theme?.overrides[token]), `${name}.${token} = ${theme?.overrides[token]}`).toBe(true);
			}
			expect(Object.keys(theme?.overrides ?? {}).sort(), name).toEqual([...THEME_TOKENS].sort());
		}
	});

	test("only tts-day is light", () => {
		for (const name of PALETTE_NAMES) expect(buildTheme(name)?.base, name).toBe(name === "tts-day" ? "light" : "dark");
	});

	test("maps pi colours onto tokens", () => {
		const theme = buildTheme("tts-dawn");
		expect(theme?.name).toBe("tts");
		expect(theme?.overrides.claude).toBe("#d8a657"); // accent
		expect(theme?.overrides.inactive).toBe("#5a524c"); // dim
		expect(theme?.overrides.suggestion).toBe("#7daea3"); // borderAccent
		expect(theme?.overrides.planMode).toBe("#89b482"); // thinkingMedium
		expect(theme?.overrides.autoAccept).toBe("#a9b665"); // success
		expect(theme?.overrides.bashBorder).toBe("#e78a4e"); // bashMode
		expect(theme?.overrides.selectionBg).toBe("#45403d"); // selectedBg
	});

	test("warning is pi warning mixed 50:50 with muted", () => {
		const { warning, muted } = PALETTES["tts-dawn"]?.colors ?? { warning: "", muted: "" };
		expect(buildTheme("tts-dawn")?.overrides.warning).toBe(mix(warning, muted, 0.5));
		expect(buildTheme("tts-dawn")?.overrides.warning).not.toBe(warning);
	});

	test("an unusable colour is left out of the overrides, not written", () => {
		const colors = { ...(PALETTES["tts-dawn"]?.colors as PaletteColors), accent: "" };
		const overrides = buildOverrides(colors);
		expect(overrides.claude).toBeUndefined();
		expect(overrides.remember).toBeUndefined();
		expect(overrides.text).toBe("#d4be98");
	});

	test("unknown palette: no theme", () => {
		expect(buildTheme("nope")).toBeUndefined();
	});

	test("base-only theme has no overrides", () => {
		expect(baseOnlyTheme("light")).toEqual({ name: "tts", base: "light", overrides: {} });
	});
});
