import { describe, expect, test } from "claude-code/testing";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings";

describe("normalizeSettings", () => {
	test("nothing usable: the defaults", () => {
		expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
		expect(normalizeSettings("x")).toEqual(DEFAULT_SETTINGS);
		expect(normalizeSettings([])).toEqual(DEFAULT_SETTINGS);
		expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
	});

	test("defaults: on, Prague, herdr off, no hold", () => {
		expect(DEFAULT_SETTINGS).toEqual({
			enabled: true,
			latitude: 50.0755,
			longitude: 14.4378,
			themes: { dawn: "tts-dawn", day: "tts-day", dusk: "tts-dusk", night: "tts-osaka-jade" },
			hold: null,
			syncHerdr: false,
		});
	});

	test("valid fields are kept", () => {
		const settings = normalizeSettings({
			enabled: false,
			latitude: -33.9,
			longitude: 151.2,
			themes: { dusk: "tts-night" },
			syncHerdr: true,
			hold: { slot: "dusk", until: "2026-11-10T18:00:00.000Z" },
		});
		expect(settings.enabled).toBe(false);
		expect(settings.latitude).toBe(-33.9);
		expect(settings.longitude).toBe(151.2);
		expect(settings.themes.dusk).toBe("tts-night");
		expect(settings.themes.night).toBe("tts-osaka-jade");
		expect(settings.syncHerdr).toBe(true);
		expect(settings.hold).toEqual({ slot: "dusk", until: "2026-11-10T18:00:00.000Z" });
	});

	test("a bad field falls back to its own default, siblings survive", () => {
		const settings = normalizeSettings({
			enabled: "yes",
			latitude: 91,
			longitude: 20,
			themes: { dawn: "nord", day: 5, dusk: "tts-night" },
			syncHerdr: 1,
			hold: { slot: "noon", until: "2026-11-10T18:00:00.000Z" },
		});
		expect(settings.enabled).toBe(true);
		expect(settings.latitude).toBe(50.0755);
		expect(settings.longitude).toBe(20);
		expect(settings.themes).toEqual({ dawn: "tts-dawn", day: "tts-day", dusk: "tts-night", night: "tts-osaka-jade" });
		expect(settings.syncHerdr).toBe(false);
		expect(settings.hold).toBeNull();
	});

	test("coordinates must be finite and in range", () => {
		expect(normalizeSettings({ latitude: Number.NaN, longitude: 181 })).toEqual(DEFAULT_SETTINGS);
		expect(normalizeSettings({ latitude: 90, longitude: -180 }).latitude).toBe(90);
	});

	test("a hold with an unreadable time is dropped", () => {
		expect(normalizeSettings({ hold: { slot: "day", until: "later" } }).hold).toBeNull();
	});
});
