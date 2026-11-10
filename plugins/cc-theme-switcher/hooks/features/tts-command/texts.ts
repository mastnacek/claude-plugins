// texts.ts — what /tts says: the help and the status, in Czech. The first
// line of each is the summary the model gets; the rest is for the person.

import type { Resolved } from "../../shared/apply";
import type { Settings } from "../../shared/settings";
import type { Slot } from "../../shared/solar";

export const SLOT_LABELS: Readonly<Record<Slot, string>> = {
	dawn: "úsvit",
	day: "den",
	dusk: "soumrak",
	night: "noc",
};

/** A time as local clock time; the date too when it is not the same day as `now`. */
export function formatUntil(until: Date, now: Date): string {
	const sameDay = until.toDateString() === now.toDateString();
	const time = until.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
	return sameDay ? time : `${until.getDate()}. ${until.getMonth() + 1}. ${time}`;
}

export function slotLine(slot: Slot, palette: string): string {
	return `${slot} (${SLOT_LABELS[slot]}) → ${palette}`;
}

export function buildHelpText(settings: Settings): string {
	return [
		`/tts: téma Claude Code podle slunce (${settings.enabled ? "zapnuto" : "vypnuto"}); /tts status ukáže stav`,
		"/tts status                          stav: slot, paleta, hold, souřadnice, herdr, vybrané téma",
		"/tts on | off                        zapne / vypne rotaci, hned se projeví",
		"/tts hold <light|dark|dawn|day|dusk|night> [2h|90m|1h30m]",
		"                                     přidrží slot (light = day, dark = night); bez délky do další změny slunce",
		"/tts hold off                        zruší hold",
		"/tts slot <dawn|day|dusk|night> <paleta>",
		"                                     přiřadí slotu přibalenou paletu: tts-dawn, tts-day, tts-dusk, tts-night, tts-osaka-jade",
		"/tts location <lat> <lon>            souřadnice (−90…90, −180…180)",
		"/tts herdr on | off                  přepíná i téma v config.toml herdru",
		"Téma jednou vyber v /theme (tts); soubor ~/.claude/themes/tts.json přepisuje plugin.",
	].join("\n");
}

export interface StatusInput {
	settings: Settings;
	resolved: Resolved;
	/** The `theme` of Claude Code's settings. */
	selected: string | undefined;
	now: Date;
	settingsError?: string;
}

export function buildStatusText(input: StatusInput): string {
	const { settings, resolved, selected, now } = input;
	const lines = [
		settings.enabled
			? `tts: zapnuto, ${slotLine(resolved.slot, resolved.palette)}`
			: `tts: vypnuto (soubor tts.json drží jen základ ${resolved.slot === "day" ? "light" : "dark"})`,
	];
	lines.push(
		resolved.hold
			? `hold:      ${resolved.hold.slot} (${SLOT_LABELS[resolved.hold.slot]}) do ${formatUntil(new Date(resolved.hold.until), now)}, slunce by teď dalo ${resolved.natural}`
			: "hold:      žádný",
	);
	lines.push(`poloha:    ${settings.latitude}, ${settings.longitude}`);
	lines.push(`herdr:     ${settings.syncHerdr ? "synchronizuje se" : "vypnuto"}`);
	lines.push(
		selected === "custom:tts"
			? "téma:      custom:tts je vybrané"
			: `téma:      ⚠ vybrané je ${selected ? `„${selected}“` : "výchozí"}, vyber v /theme téma tts`,
	);
	if (input.settingsError) lines.push(`⚠ ${input.settingsError}`);
	return lines.join("\n");
}
