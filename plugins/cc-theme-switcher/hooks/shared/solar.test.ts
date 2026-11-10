import { describe, expect, test } from "claude-code/testing";
import { nextSlotChange, slotAt, slotForElevation } from "./solar";

const PRAGUE = { lat: 50.0755, lon: 14.4378 };

/** Slot sequence over one UTC day in 1-minute steps, consecutive duplicates collapsed. */
function daySequence(isoDay: string): string[] {
	const start = new Date(`${isoDay}T00:00:00Z`).getTime();
	const seq: string[] = [];
	for (let minute = 0; minute < 24 * 60; minute++) {
		const slot = slotAt(new Date(start + minute * 60_000), PRAGUE.lat, PRAGUE.lon);
		if (seq.at(-1) !== slot) seq.push(slot);
	}
	return seq;
}

describe("slotForElevation", () => {
	test("splits twilight by direction, not by depth", () => {
		expect(slotForElevation(10, true)).toBe("day");
		expect(slotForElevation(-3, true)).toBe("dawn");
		expect(slotForElevation(-9, true)).toBe("dawn");
		expect(slotForElevation(-3, false)).toBe("dusk");
		expect(slotForElevation(-9, false)).toBe("dusk");
		expect(slotForElevation(-15, true)).toBe("night");
		expect(slotForElevation(-15, false)).toBe("night");
	});
});

describe("slotAt", () => {
	for (const day of ["2026-10-27", "2026-12-21", "2026-06-21"]) {
		test(`runs night → dawn → day → dusk → night in Prague on ${day}`, () => {
			expect(daySequence(day)).toEqual(["night", "dawn", "day", "dusk", "night"]);
		});
	}

	test("gives dawn and dusk one continuous span of about 70 minutes in late October", () => {
		const start = new Date("2026-10-27T00:00:00Z").getTime();
		const minutes: Record<string, number> = { dawn: 0, dusk: 0 };
		for (let minute = 0; minute < 24 * 60; minute++) {
			const slot = slotAt(new Date(start + minute * 60_000), PRAGUE.lat, PRAGUE.lon);
			if (slot in minutes) minutes[slot] = (minutes[slot] ?? 0) + 1;
		}
		for (const slot of ["dawn", "dusk"]) {
			const spent = minutes[slot] ?? 0;
			expect(spent >= 60 && spent <= 85, `${slot}: ${spent} min`).toBe(true);
		}
	});
});

describe("nextSlotChange", () => {
	test("finds the next boundary after noon: day gives way to dusk", () => {
		const noon = new Date("2026-10-27T11:00:00Z");
		const change = nextSlotChange(noon, PRAGUE.lat, PRAGUE.lon);
		expect(slotAt(new Date(change.getTime() - 60_000), PRAGUE.lat, PRAGUE.lon)).toBe("day");
		expect(slotAt(change, PRAGUE.lat, PRAGUE.lon)).toBe("dusk");
	});
});
