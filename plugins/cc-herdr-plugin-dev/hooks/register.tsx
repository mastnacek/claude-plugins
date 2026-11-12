// register.tsx — the composition root: it knows the slices, they don't know
// each other. Nothing else lives here.
//
// session.start may be hooked once per plugin, so it is hooked here and calls
// each slice's start. `on` / `$` go only to functions called by name: every
// slice is wired by an explicit call, never a loop over a list.

import type { EngineInterface, Register } from "claude-code";
import { registerCommand, startCommand } from "./features/command/register";
import { registerDocsGate } from "./features/docs-gate/register";
import { registerLineLimit } from "./features/line-limit/register";
import { registerManifest, startManifest } from "./features/manifest/register";
import { registerScaffold, startScaffold } from "./features/scaffold/register";

/** One slice failing leaves the others working, and never disturbs the session. */
async function guarded($: EngineInterface, slice: string, work: Promise<void>): Promise<void> {
	try {
		await work;
	} catch (error) {
		$.ui.log(`${slice}: selhalo: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
	}
}

export const register: Register = (on) => {
	on("session.start", async ($, e, next) => {
		await guarded($, "scaffold", startScaffold($));
		await guarded($, "manifest", startManifest($));
		await guarded($, "command", startCommand($));
		return next(e);
	});

	// The docs gate goes first: a refused edit never reaches line-limit.
	registerDocsGate(on);
	registerLineLimit(on);
	registerScaffold(on);
	registerManifest(on);
	registerCommand(on);
};
