// hints — one useful message at a time, shown once.
//
// The root hooks the events and calls these by name:
//   hintsCall       same call failed 3× in a row · commit went through
//   hintsTurnStart  the previous hint goes away; a 2-hour mark of the session
//   hintsTurnEnd    context at 80 % or more (only if the engine gives the figure)
// The hint on show is `hint` in $.state; face draws it (and hides it while muted).

import type { EngineInterface } from "claude-code";
import { atom, read, update } from "claude-code";
import type { CallInfo } from "../../shared/classify";
import { FRESH, onCall, onContext, onElapsed, replaces } from "./rules";
import type { Memory, Verdict } from "./rules";

const hintAtom = atom({ plugin: "cc-pixel-buddy", key: "hint" } as const, null, { shape: "hint-1" });

// Lost on a hot reload; the worst case is one hint shown again.
let mem: Memory = FRESH;

async function apply($: EngineInterface, v: Verdict): Promise<void> {
	mem = v.mem;
	const hint = v.hint;
	if (!hint) return;
	const current = await read($, hintAtom);
	if (replaces(current, hint)) await update($, hintAtom, () => hint);
}

export function hintsCall($: EngineInterface, info: CallInfo): Promise<void> {
	return apply($, onCall(mem, info));
}

export async function hintsTurnStart($: EngineInterface): Promise<void> {
	await update($, hintAtom, () => null);
	const { startedAt } = await $.session.usage();
	await apply($, onElapsed(mem, (await $.clock.now()) - startedAt));
}

export async function hintsTurnEnd($: EngineInterface): Promise<void> {
	await apply($, onContext(mem, (await $.session.usage()).context.percent));
}
