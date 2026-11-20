// home.ts — where the user's home and Claude's config folder are.
// Windows gives the Claude Code process `USERPROFILE` and no `HOME`; a copy of
// this file lives in every plugin that needs it (plugins share no code).

import type { EngineInterface } from "claude-code";

type $ = EngineInterface;

const clean = (value: string | undefined): string | undefined => value?.trim() || undefined;

/** `HOME`, else `USERPROFILE`; `undefined` when neither is set (blank counts as unset). */
export async function homeDir($: $): Promise<string | undefined> {
	return clean(await $.env.get("HOME")) ?? clean(await $.env.get("USERPROFILE"));
}

/** `CLAUDE_CONFIG_DIR`, else `<home>/.claude`; `undefined` when there is no home either. */
export async function claudeConfigDir($: $): Promise<string | undefined> {
	const custom = clean(await $.env.get("CLAUDE_CONFIG_DIR"));
	if (custom) return custom;
	const home = await homeDir($);
	return home ? `${home}/.claude` : undefined;
}
