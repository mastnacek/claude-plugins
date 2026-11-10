// run.ts — /tts: one line in, the text to show out; and the completions for
// its arguments.

import type { EngineInterface, PromptAutocompleteSuggestion } from "claude-code";
import { applyRotation, resolve, writeOff } from "../../shared/apply";
import { PALETTE_NAMES } from "../../shared/palettes";
import { selectedTheme } from "../../shared/selected-theme";
import { loadSettings, saveSettings } from "../../shared/settings";
import type { Settings } from "../../shared/settings";
import { nextSlotChange } from "../../shared/solar";
import { HOLD_TARGETS, parseDuration, parseLocation, parseSlot } from "./parse";
import { buildHelpText, buildStatusText, formatUntil, SLOT_LABELS, slotLine } from "./texts";

type $ = EngineInterface;

export const COMMAND = "tts";

const SUBCOMMANDS: Record<string, string> = {
	help: "příkazy",
	status: "slot, paleta, hold, souřadnice, vybrané téma",
	on: "zapne rotaci",
	off: "vypne rotaci",
	hold: "přidrží slot (light|dark|dawn|day|dusk|night [2h])",
	slot: "přiřadí slotu paletu",
	location: "souřadnice <lat> <lon>",
	herdr: "synchronizace herdr on|off",
};

const VALUES: Record<string, string[]> = {
	hold: [...Object.keys(HOLD_TARGETS), "off"],
	herdr: ["on", "off"],
};

export function completions(text: string, token: string): PromptAutocompleteSuggestion[] {
	const m = /^\/tts\s+(.*)$/s.exec(text);
	if (!m) return [];
	const words = (m[1] ?? "").split(/\s+/);
	const prefix = token.toLowerCase();
	if (words.length <= 1) {
		return Object.entries(SUBCOMMANDS)
			.filter(([name]) => name.startsWith(prefix))
			.map(([name, description]) => ({ text: name, description }));
	}
	const sub = (words[0] ?? "").toLowerCase();
	const values = words.length === 2 ? (VALUES[sub] ?? (sub === "slot" ? Object.keys(SLOT_LABELS) : [])) : sub === "slot" && words.length === 3 ? PALETTE_NAMES : [];
	return values.filter((v) => v.startsWith(prefix)).map((v) => ({ text: v }));
}

async function nowOf($: $): Promise<Date> {
	return new Date(await $.clock.now());
}

/** The result of a change: the settings error alone, or the summary after it was applied. */
async function applied($: $, headline: string, error?: string): Promise<string> {
	if (error) return `${error}\nNic jsem neuložil.`;
	const result = await applyRotation($);
	if (!result.settings.enabled) return headline;
	const extra = result.herdr?.status === "error" ? `\nherdr: ${result.herdr.error}` : "";
	const dir = result.createdThemesDir ? "\nVytvořena složka ~/.claude/themes (jednou restartuj Claude Code)." : "";
	return `${headline}; ${slotLine(result.resolved.slot, result.resolved.palette)}${extra}${dir}`;
}

/** Runs one /tts line; answers the text to show. */
export async function runCommand($: $, args: string): Promise<string> {
	const [sub = "", ...rest] = args.trim().split(/\s+/).filter(Boolean);
	const loaded = await loadSettings($);
	const settings: Settings = loaded.settings;
	const save = (patch: Partial<Settings>) => saveSettings($, patch);

	switch (sub.toLowerCase()) {
		case "":
		case "help":
			return buildHelpText(settings);

		case "status": {
			const now = await nowOf($);
			return buildStatusText({
				settings,
				resolved: resolve(settings, now),
				selected: await selectedTheme($),
				now,
				settingsError: loaded.error,
			});
		}

		case "on": {
			const saved = await save({ enabled: true });
			return applied($, "tts: zapnuto", saved.error);
		}

		case "off": {
			const saved = await save({ enabled: false });
			if (saved.error) return `${saved.error}\nNic jsem neuložil.`;
			await writeOff($);
			return "tts: vypnuto (tts.json drží jen základ světlý/tmavý)";
		}

		case "hold": {
			const target = (rest[0] ?? "").toLowerCase();
			if (target === "off") {
				const had = resolve(settings, await nowOf($)).hold !== null;
				const saved = await save({ hold: null });
				if (saved.error) return `${saved.error}\nNic jsem neuložil.`;
				return applied($, had ? "hold zrušen" : "žádný hold nebyl");
			}
			const slot = HOLD_TARGETS[target];
			const durationMs = rest[1] === undefined ? undefined : parseDuration(rest[1]);
			if (!slot || (rest[1] !== undefined && durationMs === undefined)) {
				return "Použití: /tts hold <light|dark|dawn|day|dusk|night> [2h|90m|1h30m]  nebo  /tts hold off";
			}
			if (!settings.enabled) return "Rotace je vypnutá, hold nemá co držet. Zapni ji: /tts on";
			const now = await nowOf($);
			const until =
				durationMs === undefined
					? nextSlotChange(now, settings.latitude, settings.longitude)
					: new Date(now.getTime() + durationMs);
			const saved = await save({ hold: { slot, until: until.toISOString() } });
			return applied($, `hold ${slot} (${SLOT_LABELS[slot]}) do ${formatUntil(until, now)}`, saved.error);
		}

		case "slot": {
			const slot = parseSlot(rest[0]);
			const palette = rest[1];
			if (!slot || !palette || !PALETTE_NAMES.includes(palette)) {
				return `Použití: /tts slot <dawn|day|dusk|night> <paleta>\nPalety: ${PALETTE_NAMES.join(", ")}`;
			}
			const saved = await save({ themes: { ...settings.themes, [slot]: palette } });
			return applied($, `slot ${slot} (${SLOT_LABELS[slot]}) → ${palette}`, saved.error);
		}

		case "location": {
			const place = parseLocation(rest[0], rest[1]);
			if (!place) return "Použití: /tts location <lat> <lon>  (šířka −90…90, délka −180…180, např. 50.0755 14.4378)";
			const saved = await save(place);
			return applied($, `poloha ${place.latitude}, ${place.longitude}`, saved.error);
		}

		case "herdr": {
			const value = rest[0]?.toLowerCase();
			if (value !== "on" && value !== "off") return `herdr: ${settings.syncHerdr ? "on" : "off"}\nPoužití: /tts herdr on|off`;
			const saved = await save({ syncHerdr: value === "on" });
			return applied($, `herdr: ${value}`, saved.error);
		}
	}
	return `Neznámý podpříkaz „${sub}“. Použij /tts help`;
}
