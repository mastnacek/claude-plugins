// command-arguments — the free-text arguments of a skill or slash command typed
// in the person's language go to English; the slash scaffold stays. Only the
// person's own and plugins' commands: a built-in's arguments are not prose.
// What counts as a value the command reads exactly comes from what the engine
// reports about it (`command.describe`: description, argument hint), never
// from a name. Also sets `pending` so the answer slice translates the reply.

import type { On } from "claude-code";
import { atom, read, update } from "claude-code";
import { getConfig } from "../../shared/config";
import { capRecord } from "../../shared/state";
import { withProgress } from "../../shared/progress";
import { translate } from "../../shared/translation/translate";
import type { CommandMeta, PendingTranslation } from "../../shared/types";
import { argumentLiterals, commandContext, literalsSurvive, needsTranslation } from "./metadata";
import { pendingFor } from "./pending";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const pendingAtom = atom({ plugin: "cc-prompt-translate", key: "pending" } as const, null as PendingTranslation | null);
const commandMetaAtom = atom({ plugin: "cc-prompt-translate", key: "commandMeta" } as const, {} as Record<string, CommandMeta>, { shape: "command-meta-1" });

export function registerCommandArguments(on: On): void {
	// Collects only; the result is never changed, whatever fails.
	on("command.describe", async ($, e, next) => {
		try {
			const meta: CommandMeta = { description: e.description, ...(e.argumentHint ? { argumentHint: e.argumentHint } : {}) };
			await update($, commandMetaAtom, (m) => capRecord({ ...m, [e.command]: meta }, 500));
		} catch {
			/* metadata is an optimisation: without it the model is told only the name */
		}
		return next(e);
	});

	on("command.run", async ($, e, next) => {
		const config = await getConfig($);
		if (!config.enabled) return next(e);
		let info: { source: string; description: string } | undefined;
		try {
			info = (await $.command.list()).find((c) => c.name === e.command);
		} catch {
			return next(e);
		}
		const source = info?.source;
		// The model answers this command: hand the answer slice `pending`, even
		// when there are no arguments to translate.
		const pending = pendingFor(config, { command: e.command, originKind: e.origin.kind, source });
		if (!pending) return next(e);
		await update($, pendingAtom, () => pending);
		if (!e.args.trim()) return next(e);

		let meta: CommandMeta | undefined;
		try {
			meta = (await read($, commandMetaAtom))[e.command];
		} catch {
			meta = undefined;
		}
		meta ??= info?.description ? { description: info.description } : undefined;
		const literals = argumentLiterals(meta?.argumentHint, meta?.description);
		if (!needsTranslation(e.args, literals)) return next(e);

		const context = commandContext(e.command, meta);
		const result = await withProgress($, () => translate($, e.args, "English", "arguments", context));
		if (result.degraded || !literalsSurvive(e.args, result.text, literals)) return next(e);
		return next({ ...e, args: result.text });
	});
}
