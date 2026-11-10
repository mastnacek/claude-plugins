// apply.ts — puts the theme of the moment on disk.
//
// Deep module with two entries: `applyRotation` (the slot of the moment, from
// the sun or a hold, becomes `~/.claude/themes/tts.json`, and herdr follows
// when asked) and `writeOff` (rotation off: `tts.json` shrinks to its base).
// Claude Code watches the themes folder and redraws by itself, so writing
// the file is the whole switch. Both are idempotent — a file that already
// holds the result is not touched — so any number of sessions may call them.

import type { EngineInterface } from "claude-code";
import { baseOnlyTheme, buildTheme, PALETTES, serializeTheme, THEME_SLUG } from "./palettes";
import { syncHerdr } from "./herdr/sync";
import type { HerdrOutcome } from "./herdr/sync";
import { claudeDir, loadSettings, saveSettings } from "./settings";
import type { Hold, Settings } from "./settings";
import { type Slot, slotAt } from "./solar";

type $ = EngineInterface;

export interface Resolved {
	/** The slot in force: the hold's while it lasts, else the sun's. */
	slot: Slot;
	palette: string;
	/** The hold still in force, if any. */
	hold: Hold | null;
	/** The sun's slot, hold aside. */
	natural: Slot;
}

export function resolve(settings: Settings, now: Date): Resolved {
	const natural = slotAt(now, settings.latitude, settings.longitude);
	const hold = settings.hold && Date.parse(settings.hold.until) > now.getTime() ? settings.hold : null;
	const slot = hold?.slot ?? natural;
	return { slot, palette: settings.themes[slot], hold, natural };
}

export interface Applied {
	settings: Settings;
	/** The settings file is unreadable: defaults are in use. */
	settingsError?: string;
	resolved: Resolved;
	/** What happened to `tts.json`: written, already right, or (rotation off) left alone. */
	theme: "written" | "unchanged" | "skipped";
	/** `~/.claude/themes` did not exist before this write (Claude Code needs one restart then). */
	createdThemesDir: boolean;
	/** Null when herdr sync is off. */
	herdr: HerdrOutcome | null;
}

async function writeThemeFile($: $, text: string): Promise<{ wrote: boolean; createdDir: boolean }> {
	const dir = `${await claudeDir($)}/themes`;
	const path = `${dir}/${THEME_SLUG}.json`;
	if (await $.fs.exists(path)) {
		if ((await $.fs.read(path)) === text) return { wrote: false, createdDir: false };
		await $.fs.write(path, text);
		return { wrote: true, createdDir: false };
	}
	const hadDir = await $.fs.exists(dir);
	await $.fs.write(path, text);
	return { wrote: true, createdDir: !hadDir };
}

/** Applies the slot of the moment. Rotation off: nothing is touched. */
export async function applyRotation($: $): Promise<Applied> {
	const loaded = await loadSettings($);
	let settings = loaded.settings;
	const now = new Date(await $.clock.now());
	const resolved = resolve(settings, now);
	const base = { settingsError: loaded.error, resolved };
	if (!settings.enabled) return { ...base, settings, theme: "skipped", createdThemesDir: false, herdr: null };

	// An expired hold is cleared for everyone.
	if (settings.hold && !resolved.hold) settings = (await saveSettings($, { hold: null })).settings;

	const theme = buildTheme(resolved.palette);
	if (!theme) throw new Error(`neznámá paleta ${resolved.palette}`);
	const written = await writeThemeFile($, serializeTheme(theme));
	const herdr = settings.syncHerdr ? await syncHerdr($, resolved.palette) : null;
	return {
		...base,
		settings,
		theme: written.wrote ? "written" : "unchanged",
		createdThemesDir: written.createdDir,
		herdr,
	};
}

/** Rotation off: `tts.json` keeps only the base of the slot of the moment. */
export async function writeOff($: $): Promise<Applied> {
	const loaded = await loadSettings($);
	const resolved = resolve(loaded.settings, new Date(await $.clock.now()));
	const base = PALETTES[resolved.palette]?.base ?? "dark";
	const written = await writeThemeFile($, serializeTheme(baseOnlyTheme(base)));
	return {
		settings: loaded.settings,
		settingsError: loaded.error,
		resolved,
		theme: written.wrote ? "written" : "unchanged",
		createdThemesDir: written.createdDir,
		herdr: null,
	};
}
