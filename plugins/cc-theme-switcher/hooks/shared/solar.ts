// solar.ts — where the sun is, and which slot of the day that makes it.
//
// Pure maths (NOAA / f.lux approximation), no engine calls: the time comes in
// as a Date, the answer goes out as a slot.

export type Slot = "dawn" | "day" | "dusk" | "night";

export const SLOTS: readonly Slot[] = ["dawn", "day", "dusk", "night"];

/** Julian day of a Date (UTC based). */
function julianDate(date: Date): number {
	const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
	const a = Math.floor((14 - (date.getUTCMonth() + 1)) / 12);
	const y = date.getUTCFullYear() + 4800 - a;
	const m = date.getUTCMonth() + 1 + 12 * a - 3;
	const jd =
		date.getUTCDate() +
		Math.floor((153 * m + 2) / 5) +
		365 * y +
		Math.floor(y / 4) -
		Math.floor(y / 100) +
		Math.floor(y / 400) -
		32045;
	return jd + (hour - 12) / 24;
}

/** Solar elevation above the horizon in degrees. */
export function solarElevation(date: Date, lat: number, lon: number): number {
	const rad = Math.PI / 180;
	const n = julianDate(date) - 2451545.0;
	const meanLongitude = (280.46 + 0.9856474 * n) % 360;
	const meanAnomaly = (357.528 + 0.9856003 * n) % 360;
	const lambda = meanLongitude + 1.915 * Math.sin(meanAnomaly * rad) + 0.02 * Math.sin(2 * meanAnomaly * rad);
	const epsilon = 23.439 - 0.0000004 * n;
	const alpha = Math.atan2(Math.cos(epsilon * rad) * Math.sin(lambda * rad), Math.cos(lambda * rad)) / rad;
	const delta = Math.asin(Math.sin(epsilon * rad) * Math.sin(lambda * rad)) / rad;
	const gmst = (280.46061837 + 360.98564736629 * n) % 360;
	const hourAngle = ((gmst + lon - alpha) % 360) * rad;
	const sinElevation =
		Math.sin(lat * rad) * Math.sin(delta * rad) + Math.cos(lat * rad) * Math.cos(delta * rad) * Math.cos(hourAngle);
	return Math.asin(sinElevation) / rad;
}

/** Look-ahead used to tell a rising sun from a setting one. */
const TREND_STEP_MS = 5 * 60_000;

/**
 * Twilight (nautical −12° up to sunrise −0.833°) is split by direction, not
 * depth: a rising sun is dawn, a setting one dusk, so a morning runs
 * night → dawn → day and an evening day → dusk → night.
 */
export function slotForElevation(elevation: number, rising: boolean): Slot {
	if (elevation > -0.833) return "day";
	if (elevation > -12) return rising ? "dawn" : "dusk";
	return "night";
}

export function slotAt(date: Date, lat: number, lon: number): Slot {
	const elevation = solarElevation(date, lat, lon);
	const later = solarElevation(new Date(date.getTime() + TREND_STEP_MS), lat, lon);
	return slotForElevation(elevation, later > elevation);
}

/** Search horizon for the next slot change (polar summers aside). */
const SCAN_LIMIT_MIN = 36 * 60;

/** First minute after `from` whose slot differs from the one at `from`. */
export function nextSlotChange(from: Date, lat: number, lon: number): Date {
	const start = slotAt(from, lat, lon);
	for (let minute = 1; minute <= SCAN_LIMIT_MIN; minute++) {
		const at = new Date(from.getTime() + minute * 60_000);
		if (slotAt(at, lat, lon) !== start) return at;
	}
	return new Date(from.getTime() + SCAN_LIMIT_MIN * 60_000);
}
