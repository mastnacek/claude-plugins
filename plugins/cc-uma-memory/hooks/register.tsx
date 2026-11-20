// register.tsx — the composition root: it knows the slices, they don't know
// each other. Nothing else lives here.
//
// session.start may be hooked once per plugin, so it is hooked here and calls
// each slice's start. `on` / `$` go only to functions called by name: every
// slice is wired by an explicit call, never a loop over a list.

import type { EngineInterface, Register } from "claude-code";
import { atom, read } from "claude-code";
import { registerDebt } from "./features/debt/register";
import { registerHumility } from "./features/humility/register";
import { registerImmune } from "./features/immune/register";
import type { MemoryState } from "./features/memory-guard/settings";
import { registerMemoryGuard, startMemoryGuard } from "./features/memory-guard/register";
import { registerMuscleSynthesis } from "./features/muscle-synthesis/register";
import { registerRecall } from "./features/recall/register";
import { registerRules } from "./features/rules/register";
import { registerShadow } from "./features/shadow/register";
import { registerStaging, startStaging } from "./features/staging/register";
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

/** What a session start does; the slices' own state is filled here and nowhere else. */
async function startAll($: EngineInterface): Promise<void> {
	await guarded($, "uma-command", startUmaCommand($));
	await guarded($, "memory-guard", startMemoryGuard($));
	await guarded($, "staging", startStaging($));
}

// `memoryState` is null until memory-guard's start computed it, and every start computes it.
const memoryStateAtom = atom({ plugin: "cc-uma-memory", key: "memoryState" } as const, null as MemoryState | null);

let starting: Promise<void> | undefined;

/** Starts the session if its state is empty (a new session after `/clear`); once, however many events ask. */
async function ensureStarted($: EngineInterface): Promise<void> {
	if ((await read($, memoryStateAtom)) !== null) return;
	starting ??= startAll($).finally(() => {
		starting = undefined;
	});
	await starting;
}

export const register: Register = (on) => {
	on("session.start", async ($, e, next) => {
		await startAll($);
		return next(e);
	});

	// `/clear` is a new session with an empty `$.state` and NO `session.start` (`session.end`
	// {reason: "clear"} runs in the old one, so its writes are lost). Rendering is pure (no `$.state`
	// writes), so the start is made lazily by the first event of the new session that can write:
	// the person's first key or paste, an emptied box, or a /uma command. Registered first, so it wraps the
	// later hooks of the same event and they see the filled state.
	on("prompt.edit", async ($, e, next) => {
		await ensureStarted($);
		return next(e);
	});
	on("prompt.change", async ($, e, next) => {
		await ensureStarted($);
		return next(e);
	});
	on("command.run", { command: "uma" }, async ($, e, next) => {
		await ensureStarted($);
		return next(e);
	});

	// Before uma-command: it wraps /uma debt (next) to refresh the label afterwards.
	registerDebt(on);
	registerUmaCommand(on);
	registerMemoryGuard(on);
	registerRecall(on);
	registerRules(on);
	registerStaging(on);
	registerWriteGate(on);
	// After write-gate: it denies the store first. Humility before immune: the cheap
	// deny without processes goes first, immune judges only what humility lets through.
	registerHumility(on);
	registerImmune(on);
	// Shadow worker and its proposals: tool.call / prompt.submit with matchers (write-gate and recall
	// hold the unmatched ones). They read the tool's result from `next` and do nothing on a deny.
	registerShadow(on);
	registerMuscleSynthesis(on);
};
