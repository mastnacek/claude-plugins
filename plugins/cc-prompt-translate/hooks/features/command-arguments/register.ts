// command-arguments — the free-text arguments of a skill or slash command typed
// in the person's language go to English; the slash scaffold stays. Only the
// person's own and plugins' commands: a built-in's arguments are not prose.
// Also sets `pending` so the answer slice translates the model's reply.

import type { On } from "claude-code";
import { atom, update } from "claude-code";
import { getConfig } from "../../shared/config";
import { withProgress } from "../../shared/progress";
import { detectLanguageOrCode } from "../../shared/translation/detect";
import { translate } from "../../shared/translation/translate";
import type { PendingTranslation } from "../../shared/types";
import { pendingFor } from "./pending";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const pendingAtom = atom({ plugin: "cc-prompt-translate", key: "pending" } as const, null as PendingTranslation | null);

export function registerCommandArguments(on: On): void {
	on("command.run", async ($, e, next) => {
		const config = await getConfig($);
		if (!config.enabled) return next(e);
		let source: string | undefined;
		try {
			source = (await $.command.list()).find((c) => c.name === e.command)?.source;
		} catch {
			return next(e);
		}
		// The model answers this command: hand the answer slice `pending`, even
		// when there are no arguments to translate.
		const pending = pendingFor(config, { command: e.command, originKind: e.origin.kind, source });
		if (!pending) return next(e);
		await update($, pendingAtom, () => pending);
		if (!e.args.trim()) return next(e);
		if (detectLanguageOrCode(e.args).isEnglishOrCode) return next(e);
		const result = await withProgress($, () => translate($, e.args, "English", "prompt"));
		if (result.degraded) return next(e);
		return next({ ...e, args: result.text });
	});
}
