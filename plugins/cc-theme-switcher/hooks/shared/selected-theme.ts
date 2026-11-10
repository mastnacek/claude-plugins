// selected-theme.ts — is the theme this plugin writes the one Claude Code shows?
//
// The user picks it once in /theme; Claude Code stores `"theme": "custom:tts"`
// in ~/.claude/settings.json.

import type { EngineInterface } from "claude-code";
import { THEME_SLUG } from "./palettes";
import { claudeDir } from "./settings";

export const SELECTED_VALUE = `custom:${THEME_SLUG}`;

/** The `theme` value of Claude Code's settings, or undefined when unset or unreadable. */
export async function selectedTheme($: EngineInterface): Promise<string | undefined> {
	try {
		const path = `${await claudeDir($)}/settings.json`;
		if (!(await $.fs.exists(path))) return undefined;
		const parsed: unknown = JSON.parse(await $.fs.read(path));
		const theme = (parsed as { theme?: unknown } | null)?.theme;
		return typeof theme === "string" ? theme : undefined;
	} catch {
		return undefined;
	}
}
