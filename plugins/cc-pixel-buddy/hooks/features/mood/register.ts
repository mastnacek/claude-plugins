// mood — the buddy's face follows the work.
//
// An event without a matcher may be hooked once per plugin, so the root hooks
// turn.start / turn.complete / tool.call and calls these by name:
//   startMood          first mood + a minute timer that lets the buddy fall asleep
//   moodTurnStart/End  thinking while a turn runs (the main loop only)
//   moodCall           a finished tool call → errors in a row, last test, commit

import type { EngineInterface } from "claude-code";
import { atom, update } from "claude-code";
import type { CallInfo } from "../../shared/classify";
import { SLEEP_AFTER_MS, step } from "./rules";
import type { Signal } from "./rules";

const moodAtom = atom({ plugin: "cc-pixel-buddy", key: "mood" } as const, null, { shape: "mood-1" });

let lastAt = 0;

async function signal($: EngineInterface, s: Signal): Promise<void> {
	if (s.kind !== "idle") lastAt = await $.clock.now();
	await update($, moodAtom, (m) => step(m, s));
}

export function moodTurnStart($: EngineInterface): Promise<void> {
	return signal($, { kind: "turn-start" });
}
export function moodTurnEnd($: EngineInterface): Promise<void> {
	return signal($, { kind: "turn-end" });
}
export function moodCall($: EngineInterface, info: CallInfo): Promise<void> {
	return signal($, { kind: "call", info });
}

/** Session start, run by the root. */
export async function startMood($: EngineInterface): Promise<void> {
	lastAt = await $.clock.now();
	await update($, moodAtom, (m) => step(m, { kind: "turn-end" }));
	$.clock.every(60_000, async () => {
		if ((await $.clock.now()) - lastAt >= SLEEP_AFTER_MS) await signal($, { kind: "idle" });
	});
}
