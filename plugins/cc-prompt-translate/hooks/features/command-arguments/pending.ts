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
