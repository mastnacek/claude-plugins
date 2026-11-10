// register.tsx — the composition root: it knows the slices, they don't know
// each other. Nothing else lives here.
//
// Each feature is a vertical slice under ./features/<name>/ with its own hooks,
// logic and notes (CLAUDE.md). What they share is ./shared/: the translation
// engine (a deep module), configuration, credit, logging, and the values in
// $.state through which slices talk (`pending`, `translating`, `credit`, …).
//
// Two engine rules shape this file: an event may be hooked once per plugin
// without a matcher, so session.start is hooked here once and calls each
// slice's start; and `on` / `$` may only be passed to functions called by
// name, so every slice is wired by an explicit call, not a loop over a list.

import type { EngineInterface, Register } from "claude-code";
import { registerAnswerToTarget, startAnswerToTarget } from "./features/answer-to-target/register";
import { registerCommandArguments } from "./features/command-arguments/register";
import { registerIndicator, startIndicator } from "./features/indicator/register";
import { registerPromptToEnglish, startPromptToEnglish } from "./features/prompt-to-english/register";
import { registerQuestionDialog } from "./features/question-dialog/register";
import { registerSettingsCommand, startSettingsCommand } from "./features/settings-command/register";
import { initConfig } from "./shared/config";
import { warn } from "./shared/log";

/** One slice failing to start leaves the others working. */
async function guarded($: EngineInterface, slice: string, started: Promise<void>): Promise<void> {
	try {
		await started;
	} catch (error) {
		warn($, `${slice}: start selhal: ${error instanceof Error ? error.message : String(error)}`);
	}
}

export const register: Register = (on) => {
	on("session.start", async ($, e, next) => {
		await initConfig($);
		await guarded($, "settings-command", startSettingsCommand($));
		// The prompt slice restores the originals the answer slice's recovery reads.
		await guarded($, "prompt-to-english", startPromptToEnglish($));
		await guarded($, "answer-to-target", startAnswerToTarget($));
		await guarded($, "indicator", startIndicator($));
		return next(e);
	});

	registerSettingsCommand(on);
	registerPromptToEnglish(on);
	registerAnswerToTarget(on);
	registerQuestionDialog(on);
	registerCommandArguments(on);
	registerIndicator(on);
};
