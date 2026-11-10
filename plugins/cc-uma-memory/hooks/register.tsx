// register.tsx — the composition root: it knows the slices, they don't know
// each other. Nothing else lives here.
//
// session.start may be hooked once per plugin, so it is hooked here and calls
// each slice's start. `on` / `$` go only to functions called by name: every
// slice is wired by an explicit call, never a loop over a list.

import type { EngineInterface, Register } from "claude-code";
import { registerMemoryGuard, startMemoryGuard } from "./features/memory-guard/register";

/** One slice failing to start leaves the others working. */
async function guarded($: EngineInterface, slice: string, started: Promise<void>): Promise<void> {
	try {
		await started;
	} catch (error) {
		$.ui.log(`cc-uma-memory: ${slice}: start selhal: ${error instanceof Error ? error.message : String(error)}`);
	}
}

export const register: Register = (on) => {
	on("session.start", async ($, e, next) => {
		await guarded($, "memory-guard", startMemoryGuard($));
		return next(e);
	});

	registerMemoryGuard(on);
};
