// parse.ts — the arguments of /tts that carry a value.

import { type Slot, SLOTS } from "../../shared/solar";

/** `/tts hold` targets: the slots plus the light/dark aliases. */
export const HOLD_TARGETS: Readonly<Record<string, Slot>> = {
	light: "day",
	dark: "night",
	dawn: "dawn",
	day: "day",
	dusk: "dusk",
	night: "night",
};

/** "2h", "90m", "1h30m" → milliseconds; undefined when malformed or zero. */
export function parseDuration(text: string): number | undefined {
	const match = /^(?:(\d+)h)?(?:(\d+)m)?$/i.exec(text);
	if (!match || (match[1] === undefined && match[2] === undefined)) return undefined;
	const minutes = Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
	return minutes > 0 ? minutes * 60_000 : undefined;
}

export function parseSlot(text: string | undefined): Slot | undefined {
	return SLOTS.find((s) => s === text?.toLowerCase());
}

/** Latitude −90…90 and longitude −180…180 as numbers; undefined otherwise. */
export function parseLocation(lat: string | undefined, lon: string | undefined): { latitude: number; longitude: number } | undefined {
	const number = (text: string | undefined): number => (text !== undefined && text.trim() !== "" ? Number(text.replace(",", ".")) : Number.NaN);
	const latitude = number(lat);
	const longitude = number(lon);
	if (!(latitude >= -90 && latitude <= 90) || !(longitude >= -180 && longitude <= 180)) return undefined;
	return { latitude, longitude };
}
