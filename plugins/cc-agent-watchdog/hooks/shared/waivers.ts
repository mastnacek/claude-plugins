// waivers.ts — exceptions to rules, read from the ledger. Pure.
//
// A granted exception (`kind: "waiver"`, decision allow) is valid from its line until the end of the turn
// (the next `turn` line), or until `scope.calls` further tool calls have been made, whichever is first.
// Its own tool call and other waiver requests do not count as calls. Use is not stored: a violation
// whose time lies inside the window is the use.

import type { Ev, Rule, ToolEv, WaiverEv } from "./types";

/** The tool name the model calls (the full name carries the plugin's prefix). */
export const WAIVER_TOOL = "watchdog_waiver";

/** Most calls one exception can cover. */
export const MAX_CALLS = 20;

export const isWaiverTool = (tool: string): boolean => tool === WAIVER_TOOL || tool.endsWith(`__${WAIVER_TOOL}`);

/** Can an exception be granted for this rule? Undefined = yes, else why not. */
export function refusal(rule: Rule): string | undefined {
	if (rule.weight === "instant") return `${rule.id} je pravidlo s instant failure — výjimku nelze udělit. Porušení nedělej.`;
	return rule.noWaiver ? `${rule.id}: výjimku nelze udělit (${rule.noWaiver}).` : undefined;
}

export type Window = { waiver: WaiverEv; from: number; to: number; used: number; open: boolean };

/** The window of the granted exception at `events[i]`: where it ends and whether it is still open. */
function windowAt(events: readonly Ev[], i: number): Window {
	const waiver = events[i] as WaiverEv;
	const calls = waiver.scope.calls;
	let used = 0;
	for (let j = i + 1; j < events.length; j++) {
		const ev = events[j] as Ev;
		if (ev.kind === "turn") return { waiver, from: waiver.ts, to: ev.ts, used, open: false };
		if (ev.kind !== "tool" || isWaiverTool((ev as ToolEv).tool)) continue;
		used++;
		if (calls !== undefined && used >= calls) return { waiver, from: waiver.ts, to: ev.ts, used, open: false };
	}
	return { waiver, from: waiver.ts, to: Number.POSITIVE_INFINITY, used, open: true };
}

/** Windows of every granted exception, in ledger order. */
export function windows(events: readonly Ev[]): Window[] {
	const out: Window[] = [];
	events.forEach((ev, i) => {
		if (ev.kind === "waiver" && ev.decision === "allow") out.push(windowAt(events, i));
	});
	return out;
}

/** The exception that covers the NEXT tool call for `rule`, if one is open. */
export const openWaiver = (events: readonly Ev[], rule: string): WaiverEv | undefined => windows(events).findLast((w) => w.open && w.waiver.rule === rule)?.waiver;

/** The granted exceptions that still cover the next calls. */
export const openWindows = (events: readonly Ev[]): Window[] => windows(events).filter((w) => w.open);

export function counts(events: readonly Ev[]): { requested: number; granted: number } {
	const all = events.filter((e): e is WaiverEv => e.kind === "waiver");
	return { requested: all.length, granted: all.filter((w) => w.decision === "allow").length };
}

/** What is left of an open exception, for people: "do konce tahu" / "zbývá 12 volání". */
export function remaining(w: Window): string {
	const calls = w.waiver.scope.calls;
	return calls === undefined ? "do konce tahu" : `zbývá ${calls - w.used} z ${calls} volání, nejdéle do konce tahu`;
}
