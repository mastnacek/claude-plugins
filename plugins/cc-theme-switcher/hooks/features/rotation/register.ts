// rotation — the sun turns the theme.
//
//   start   writes the theme of the moment, then every minute again; says once
//           what is left for the user to do (pick `tts` in /theme)

import type { EngineInterface } from "claude-code";
import { type Applied, applyRotation } from "../../shared/apply";
import { SELECTED_VALUE, selectedTheme } from "../../shared/selected-theme";

const TICK_MS = 60_000;

/** The one-line notes for the user after the first write; none when all is well. */
export async function startNotes($: EngineInterface, applied: Applied): Promise<string[]> {
	const notes: string[] = [];
	if (applied.settingsError) notes.push(applied.settingsError);
	if (applied.herdr?.status === "error") notes.push(`herdr: ${applied.herdr.error}`);
	if (applied.herdr?.status === "updated" && applied.herdr.autoSwitchDisabled) {
		notes.push("herdr: vypnuto auto_switch v config.toml, jinak by téma přebíjel");
	}
	const restart = applied.createdThemesDir ? " (jednou restartuj Claude Code)" : "";
	if (applied.settings.enabled && (await selectedTheme($)) !== SELECTED_VALUE) {
		notes.push(`vyber v /theme téma tts${restart}`);
	} else if (restart) {
		notes.push(`vytvořena složka ~/.claude/themes${restart}`);
	}
	return notes;
}

/** Session start, run by the root. */
export async function startRotation($: EngineInterface): Promise<void> {
	for (const note of await startNotes($, await applyRotation($))) $.ui.log(note);

	let failed = false;
	$.clock.every(TICK_MS, () => {
		applyRotation($).then(
			() => {
				failed = false;
			},
			(error: unknown) => {
				// One line per run of failures, not one per minute.
				if (!failed) $.ui.log(error instanceof Error ? error.message : String(error));
				failed = true;
			},
		);
	});
}
