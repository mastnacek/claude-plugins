// command-arguments — the free-text arguments of a skill or slash command typed
// in the person's language go to English; the slash scaffold stays. Only the
// person's own and plugins' commands: a built-in's arguments are not prose.

import type { On } from "claude-code";
import { getConfig } from "../../shared/config";
import { withProgress } from "../../shared/progress";
import { detectLanguageOrCode } from "../../shared/translation/detect";
import { translate } from "../../shared/translation/translate";

// The settings slice's own command; its arguments are subcommands, not prose.
const OWN_COMMAND = "prompt-translate";

export function registerCommandArguments(on: On): void {
	on("command.run", async ($, e, next) => {
		const config = await getConfig($);
		if (!config.enabled || e.command === OWN_COMMAND || !e.args.trim()) return next(e);
		if (e.origin.kind !== "composer" && e.origin.kind !== "bridge") return next(e);
		let source: string | undefined;
		try {
			source = (await $.command.list()).find((c) => c.name === e.command)?.source;
		} catch {
			return next(e);
		}
		if (source !== "plugin" && source !== "user") return next(e);
		if (detectLanguageOrCode(e.args).isEnglishOrCode) return next(e);
		const result = await withProgress($, () => translate($, e.args, "English", "prompt"));
		if (result.degraded) return next(e);
		return next({ ...e, args: result.text });
	});
}
