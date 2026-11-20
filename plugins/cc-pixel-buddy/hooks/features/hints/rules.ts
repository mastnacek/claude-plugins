// Hint rules: pure. Each takes the memory and a fact and returns the new memory plus a hint, if one is due.

import type { Hint } from "claude-code";
import type { CallInfo } from "../../shared/classify";

export type Memory = {
	/** The call that failed last, and how many times in a row. */
	failKey: string;
	failCount: number;
	/** The context hint may fire (false from the moment it fired until usage drops under the limit). */
	contextArmed: boolean;
	/** How many 2-hour marks of the session have been announced. */
	breaks: number;
};

export type Verdict = { mem: Memory; hint?: Hint };

export const FRESH: Memory = { failKey: "", failCount: 0, contextArmed: true, breaks: 0 };

export const REPEAT_AT = 3;
export const CONTEXT_AT = 80;
export const BREAK_MS = 2 * 3_600_000;

/** Most important first: a new hint replaces the one on show only when it is at least as important. */
const PRIORITY: ReadonlyArray<Hint["id"]> = ["repeat", "context", "break", "commit"];

export function replaces(current: Hint | null, next: Hint): boolean {
	return current === null || PRIORITY.indexOf(next.id) <= PRIORITY.indexOf(current.id);
}

export function onCall(mem: Memory, info: CallInfo): Verdict {
	if (!info.isError) {
		const next = { ...mem, failKey: "", failCount: 0 };
		return info.isCommit ? { mem: next, hint: { id: "commit", text: "commit je venku — pěkná práce 🎉", tone: "success" } } : { mem: next };
	}
	const failCount = info.key === mem.failKey ? mem.failCount + 1 : 1;
	const next = { ...mem, failKey: info.key, failCount };
	return failCount === REPEAT_AT ? { mem: next, hint: { id: "repeat", text: `${REPEAT_AT}× stejná chyba — zkus jiný postup`, tone: "error" } } : { mem: next };
}

export function onContext(mem: Memory, percent: number | undefined): Verdict {
	if (percent === undefined || percent < CONTEXT_AT) return { mem: { ...mem, contextArmed: true } };
	if (!mem.contextArmed) return { mem };
	return { mem: { ...mem, contextArmed: false }, hint: { id: "context", text: `kontext ${Math.round(percent)} % — zvaž /compact`, tone: "warning" } };
}

export function onElapsed(mem: Memory, elapsedMs: number): Verdict {
	const marks = Math.floor(elapsedMs / BREAK_MS);
	if (marks <= mem.breaks) return { mem };
	return { mem: { ...mem, breaks: marks }, hint: { id: "break", text: `${marks * 2} h práce — dej si pauzu ☕`, tone: "warning" } };
}
