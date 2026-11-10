// settings.ts — the plugin's settings: one JSON file shared by every session
// (`~/.claude/cc-theme-switcher.json`), validated field by field.
//
// A bad field falls back to its own default and its valid siblings survive.
// A file that is not JSON is never overwritten: the plugin runs on defaults,
// says so, and refuses to save until the user repairs the file.

import type { EngineInterface } from "claude-code";
import { PALETTES } from "./palettes";
import { type Slot, SLOTS } from "./solar";

type $ = EngineInterface;

/** A manual override of the sun: `slot` holds until `until` (ISO timestamp). */
export interface Hold {
	slot: Slot;
	until: string;
}

export interface Settings {
	enabled: boolean;
	latitude: number;
	longitude: number;
	/** Bundled palette per slot. */
	themes: Record<Slot, string>;
	hold: Hold | null;
	/** Also follow the slot in herdr's config.toml. Off: herdr's config is never read. */
	syncHerdr: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
	enabled: true,
	latitude: 50.0755, // Prague
	longitude: 14.4378,
	themes: { dawn: "tts-dawn", day: "tts-day", dusk: "tts-dusk", night: "tts-osaka-jade" },
	hold: null,
	syncHerdr: false,
};

export const SETTINGS_FILE = "cc-theme-switcher.json";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inRange(value: unknown, min: number, max: number): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function normalizeHold(value: unknown): Hold | null {
	if (!isRecord(value)) return null;
	const slot = SLOTS.find((s) => s === value.slot);
	if (!slot || typeof value.until !== "string" || !Number.isFinite(Date.parse(value.until))) return null;
	return { slot, until: value.until };
}

/** Any value to settings: each field valid or its default. */
export function normalizeSettings(raw: unknown): Settings {
	const v = isRecord(raw) ? raw : {};
	const themes = isRecord(v.themes) ? v.themes : {};
	const pick = (slot: Slot): string => {
		const name = themes[slot];
		return typeof name === "string" && name in PALETTES ? name : DEFAULT_SETTINGS.themes[slot];
	};
	return {
		enabled: typeof v.enabled === "boolean" ? v.enabled : DEFAULT_SETTINGS.enabled,
		latitude: inRange(v.latitude, -90, 90) ? v.latitude : DEFAULT_SETTINGS.latitude,
		longitude: inRange(v.longitude, -180, 180) ? v.longitude : DEFAULT_SETTINGS.longitude,
		themes: { dawn: pick("dawn"), day: pick("day"), dusk: pick("dusk"), night: pick("night") },
		hold: normalizeHold(v.hold),
		syncHerdr: typeof v.syncHerdr === "boolean" ? v.syncHerdr : DEFAULT_SETTINGS.syncHerdr,
	};
}

/** Claude Code's config folder: `CLAUDE_CONFIG_DIR`, else `~/.claude`. */
export async function claudeDir($: $): Promise<string> {
	const custom = (await $.env.get("CLAUDE_CONFIG_DIR"))?.trim();
	if (custom) return custom;
	const home = (await $.env.get("HOME"))?.trim();
	if (!home) throw new Error("nenalezen domovský adresář (HOME)");
	return `${home}/.claude`;
}

export interface LoadedSettings {
	settings: Settings;
	/** Set when the file exists but is not a JSON object: defaults are in use, the file is untouched. */
	error?: string;
}

export async function loadSettings($: $): Promise<LoadedSettings> {
	const path = `${await claudeDir($)}/${SETTINGS_FILE}`;
	if (!(await $.fs.exists(path))) return { settings: DEFAULT_SETTINGS };
	try {
		const parsed: unknown = JSON.parse(await $.fs.read(path));
		if (!isRecord(parsed)) throw new Error("není objekt");
		return { settings: normalizeSettings(parsed) };
	} catch (error) {
		const why = error instanceof Error ? error.message : String(error);
		return { settings: DEFAULT_SETTINGS, error: `${path} nejde přečíst (${why}); běží výchozí nastavení, soubor nechávám být` };
	}
}

/** Changes some fields and saves. Answers the reason when nothing was saved. */
export async function saveSettings($: $, patch: Partial<Settings>): Promise<{ settings: Settings; error?: string }> {
	const loaded = await loadSettings($);
	if (loaded.error) return { settings: loaded.settings, error: loaded.error };
	const settings = normalizeSettings({ ...loaded.settings, ...patch });
	await $.fs.write(`${await claudeDir($)}/${SETTINGS_FILE}`, `${JSON.stringify(settings, null, 2)}\n`);
	return { settings };
}
