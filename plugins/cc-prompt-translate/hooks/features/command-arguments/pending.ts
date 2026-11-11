// Whether a slash command hands the answer slice a `pending` translation:
// the model answers the person's own and plugins' commands, not a built-in's.

import type { PendingTranslation, TranslateConfig } from "../../shared/types";

// The settings slice's own command; its arguments are subcommands, not prose.
export const OWN_COMMAND = "prompt-translate";

export interface CommandRun {
	command: string;
	originKind: string;
	// `source` from `$.command.list()`; undefined when the command is unknown.
	source: string | undefined;
}

export function isAnsweredByModel(run: CommandRun): boolean {
	if (run.originKind !== "composer" && run.originKind !== "bridge") return false;
	return run.source === "plugin" || run.source === "user";
}

export function pendingFor(config: TranslateConfig, run: CommandRun): PendingTranslation | null {
	if (!config.enabled || run.command === OWN_COMMAND || !isAnsweredByModel(run)) return null;
	return { targetLanguage: config.targetLanguage, translateResponses: config.translateResponses };
}

/**
 * Whether the arguments are prose worth translating, or values the command
 * compares exactly. A plugin's skill or manifest command is namespaced
 * (`plugin:skill`) and gets free text; a command a plugin registers from code
 * (`/tts help`, `/spec-check`) has no colon and reads subcommands — translated,
 * `help` came back as "Help." and the command no longer knew it. The person's
 * own commands and skills take prose. `$.command.list()` gives no argument
 * schema, so the name's shape is the only signal.
 */
export function argsAreProse(run: CommandRun): boolean {
	if (!isAnsweredByModel(run) || run.command === OWN_COMMAND) return false;
	if (run.source === "user") return true;
	return run.command.includes(":");
}
