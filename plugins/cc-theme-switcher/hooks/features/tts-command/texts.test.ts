import { describe, expect, test } from "claude-code/testing";
import type { Resolved } from "../../shared/apply";
import { DEFAULT_SETTINGS } from "../../shared/settings";
import { buildHelpText, buildStatusText } from "./texts";

const NOW = new Date("2026-11-10T12:00:00Z");
const resolved: Resolved = { slot: "day", palette: "tts-day", hold: null, natural: "day" };

describe("status", () => {
	test("the first line is the one-line summary", () => {
		const text = buildStatusText({ settings: DEFAULT_SETTINGS, resolved, selected: "custom:tts", now: NOW });
		expect(text.split("\n")[0]).toBe("tts: zapnuto, day (den) → tts-day");
		expect(text).toContain("hold:      žádný");
		expect(text).toContain("poloha:    50.0755, 14.4378");
		expect(text).toContain("herdr:     vypnuto");
		expect(text).toContain("custom:tts je vybrané");
	});

	test("another theme selected: tells to pick tts in /theme", () => {
		const text = buildStatusText({ settings: DEFAULT_SETTINGS, resolved, selected: "dark", now: NOW });
		expect(text).toContain("vyber v /theme téma tts");
		expect(text).toContain("„dark“");
		expect(buildStatusText({ settings: DEFAULT_SETTINGS, resolved, selected: undefined, now: NOW })).toContain("vybrané je výchozí");
	});

	test("a hold shows its slot, its end and what the sun would say", () => {
		const hold = { slot: "night" as const, until: "2026-11-10T20:30:00.000Z" };
		const text = buildStatusText({
			settings: { ...DEFAULT_SETTINGS, hold },
			resolved: { slot: "night", palette: "tts-osaka-jade", hold, natural: "day" },
			selected: "custom:tts",
			now: NOW,
		});
		expect(text).toContain("hold:      night (noc) do ");
		expect(text).toContain("slunce by teď dalo day");
	});

	test("off, and a broken settings file", () => {
		const text = buildStatusText({
			settings: { ...DEFAULT_SETTINGS, enabled: false },
			resolved,
			selected: "custom:tts",
			now: NOW,
			settingsError: "soubor nejde přečíst",
		});
		expect(text.split("\n")[0]).toContain("vypnuto");
		expect(text).toContain("⚠ soubor nejde přečíst");
	});
});

describe("help", () => {
	test("lists every command and the switch state", () => {
		const text = buildHelpText(DEFAULT_SETTINGS);
		for (const part of ["status", "on | off", "hold", "slot", "location", "herdr"]) expect(text).toContain(part);
		expect(text.split("\n")[0]).toContain("zapnuto");
		expect(buildHelpText({ ...DEFAULT_SETTINGS, enabled: false }).split("\n")[0]).toContain("vypnuto");
	});
});
