// register.tsx — the composition root: it knows the slices, they don't know
// each other. Nothing else lives here.
//
// session.start may be hooked once per plugin, so it is hooked here and calls
// each slice's start. `on` / `$` go only to functions called by name: every
// slice is wired by an explicit call, never a loop over a list.

import type { EngineInterface, Register } from "claude-code";
import { registerDebt } from "./features/debt/register";
import { registerImmune } from "./features/immune/register";
import { registerMemoryGuard, startMemoryGuard } from "./features/memory-guard/register";
import { registerRecall } from "./features/recall/register";
import { registerRules } from "./features/rules/register";
import { registerUmaCommand, startUmaCommand } from "./features/uma-command/register";
import { registerWriteGate } from "./features/write-gate/register";

/** One slice failing to start leaves the others working. */
async function guarded($: EngineInterface, slice: string, started: Promise<void>): Promise<void> {
	try {
		await started;
	} catch (error) {
		$.ui.log(`${slice}: start selhal: ${error instanceof Error ? error.message : String(error)}`);
	}
}

export const register: Register = (on) => {
	on("session.start", async ($, e, next) => {
		await guarded($, "uma-command", startUmaCommand($));
		await guarded($, "memory-guard", startMemoryGuard($));
		return next(e);
	});

	// Before uma-command: it wraps /uma debt (next) to refresh the label afterwards.
	registerDebt(on);
	registerUmaCommand(on);
	registerMemoryGuard(on);
	registerRecall(on);
	registerRules(on);
	registerWriteGate(on);
	// After write-gate: it denies the store first; immune judges the rest.
	registerImmune(on);
};
