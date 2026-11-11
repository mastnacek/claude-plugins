// world.ts — a pretend engine for tests that drive the whole plugin (only *.test.ts files import it):
// a clock that moves when the test says, a store, session usage, panes and tools that answer what the test says.

import type { On } from "claude-code";
import { mock } from "claude-code/testing";

export type World = {
	/** Context fill the engine reports, in percent (undefined = no figure). */
	percent: number | undefined;
	/** When the session began (ms); default: the clock's start. */
	startedAt: number | undefined;
	/** Does a pane get seated? */
	placed: boolean;
	/** Panes opened / closed, in order. */
	panes: string[];
	/** What the plugin's $.store holds; a test seeds it and reads it back. */
	store: Record<string, unknown>;
};

export const T0 = new Date(2026, 0, 5, 12).getTime();

export const fresh = (over: Partial<World> = {}): World => ({ percent: undefined, startedAt: undefined, placed: true, panes: [], store: {}, ...over });

/** A command containing FAIL (or an Edit of a file containing "bad") fails; everything else passes. */
function fails(e: unknown): boolean {
	const r = e as { command?: string; file_path?: string };
	return (r.command ?? "").includes("FAIL") || (r.file_path ?? "").includes("bad");
}

/**
 * Hooks can be registered only before the test first uses `$`, so a test registers
 * them once, over a world it changes between calls.
 */
export function setup(on: On, w: World) {
	const clock = mock.clock(on, { now: T0 });
	on("store.get", (_$, e) => ({ value: w.store[e.key] }));
	on("store.set", (_$, e) => {
		w.store[e.key] = JSON.parse(JSON.stringify(e.value));
		return { value: undefined };
	});
	on("session.usage", () => ({ value: { startedAt: w.startedAt ?? T0, context: { window: 200000, percent: w.percent }, rateLimits: [] } }));
	on("command.register", (_$, e) => ({ value: { command: e.name } }));
	on("ui.open", (_$, e) => {
		w.panes.push(`open:${e.id}`);
		return { value: w.placed ? { isPlaced: true } : { isPlaced: false, reason: "narrow" } };
	});
	on("ui.close", (_$, e) => {
		w.panes.push(`close:${e.id}`);
		return { value: undefined };
	});
	on("session.start", (_$, e) => ({ cwd: e.cwd }));
	on("turn.start", (_$, e) => ({ turnId: e.turnId }));
	on("turn.complete", (_$, e) => ({ text: e.answer }));
	on("tool.call", (_$, e) => (fails(e) ? ({ result: {}, text: "boom", isError: true } as never) : ({ result: {}, text: "ok" } as never)));
	return clock;
}

type Host = {
	session: { start: (a: never) => Promise<unknown> };
	turn: { start: (a: never) => Promise<unknown>; complete: (a: never) => Promise<unknown> };
	tool: { call: (a: never) => Promise<unknown> };
	command: { run: (a: never) => Promise<{ text?: string }> };
	ui: { mount: (a: never) => Promise<{ find: (a: never) => Promise<{ text?: string; props?: Record<string, unknown> } | undefined>; unmount: () => Promise<void> }> };
};

let n = 0;
const host = ($: unknown) => $ as Host;

export const start = ($: unknown) => host($).session.start({ cwd: "/work", surface: "terminal", isInteractive: true } as never);
export const turnStart = ($: unknown, agentId?: string) => host($).turn.start({ text: "go", turnId: `t${++n}`, agentId } as never);
export const turnEnd = ($: unknown, agentId?: string) => host($).turn.complete({ answer: "done", durationMs: 1, isAborted: false, turnId: `t${++n}`, reason: "answer", agentId } as never);
export const bash = ($: unknown, command: string) => host($).tool.call({ tool: "Bash", command } as never);
export const edit = ($: unknown, file_path: string, tool = "Edit") => host($).tool.call({ tool, file_path, old_string: "a", new_string: "b" } as never);
export const run = ($: unknown, args: string) => host($).command.run({ command: "buddy", args, origin: { kind: "composer" }, presentation: { isFullscreen: false, columns: 80 } } as never);
export const mount = ($: unknown, component: "AbovePrompt" | "Pane" | "CommandOutput", props: Record<string, unknown>, requestId?: string) =>
	host($).ui.mount({ plugin: "cc-pixel-buddy", surface: "terminal", component, requestId, props } as never);
