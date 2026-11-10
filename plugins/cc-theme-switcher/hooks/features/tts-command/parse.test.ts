import { describe, expect, test } from "claude-code/testing";
import { HOLD_TARGETS, parseDuration, parseLocation, parseSlot } from "./parse";

describe("parseDuration", () => {
	test("accepts hours, minutes and both", () => {
		expect(parseDuration("2h")).toBe(2 * 3_600_000);
		expect(parseDuration("90m")).toBe(90 * 60_000);
		expect(parseDuration("1h30m")).toBe(90 * 60_000);
		expect(parseDuration("1H30M")).toBe(90 * 60_000);
	});

	test("rejects malformed and zero durations", () => {
		for (const bad of ["", "abc", "0m", "0h0m", "2x", "h", "-5m", "1.5h", "30m1h"]) {
			expect(parseDuration(bad), bad).toBeUndefined();
		}
	});
});

describe("hold targets", () => {
	test("light is day, dark is night, slots stand for themselves", () => {
		expect(HOLD_TARGETS.light).toBe("day");
		expect(HOLD_TARGETS.dark).toBe("night");
		for (const slot of ["dawn", "day", "dusk", "night"]) expect(HOLD_TARGETS[slot]).toBe(slot);
		expect(HOLD_TARGETS.noon).toBeUndefined();
	});
});

describe("parseSlot", () => {
	test("a slot name in any case, nothing else", () => {
		expect(parseSlot("Dusk")).toBe("dusk");
		expect(parseSlot("light")).toBeUndefined();
		expect(parseSlot(undefined)).toBeUndefined();
	});
});

describe("parseLocation", () => {
	test("accepts coordinates in range, decimal comma too", () => {
		expect(parseLocation("50.0755", "14.4378")).toEqual({ latitude: 50.0755, longitude: 14.4378 });
		expect(parseLocation("50,5", "-14,2")).toEqual({ latitude: 50.5, longitude: -14.2 });
		expect(parseLocation("-90", "180")).toEqual({ latitude: -90, longitude: 180 });
	});

	test("refuses out of range, missing and non-numbers", () => {
		for (const [lat, lon] of [["91", "0"], ["0", "181"], ["-90.1", "0"], ["x", "1"], ["1", undefined], [undefined, undefined], ["", "1"]] as const) {
			expect(parseLocation(lat, lon), `${lat} ${lon}`).toBeUndefined();
		}
	});
});
