// progress.ts — "a translation is running", for whoever draws it (the indicator
// slice). Slices wrap their translate() calls in withProgress and never learn
// who listens: the flag lives in $.state, not in a call to another slice.

import type { EngineInterface } from "claude-code";
import { atom, update } from "claude-code";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const translatingAtom = atom({ plugin: "prompt-translate", key: "translating" } as const, false);

// Translations in flight: the flag drops only when the last one ends.
let inFlight = 0;

export async function withProgress<T>($: EngineInterface, work: () => Promise<T>): Promise<T> {
	inFlight += 1;
	await update($, translatingAtom, () => true);
	try {
		return await work();
	} finally {
		inFlight = Math.max(0, inFlight - 1);
		if (inFlight === 0) await update($, translatingAtom, () => false);
	}
}
