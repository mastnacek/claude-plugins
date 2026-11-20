// world.ts — a pretend machine for tests that drive the whole plugin (only *.test.ts files import it):
// an in-memory file system, a session folder, and a core that answers every tool call with `answer`.

import type { On } from "claude-code";

/** Strips a Windows drive letter and backslashes, as the engine's test mapping needs. */
export const norm = (p: string): string => p.replace(/\\/g, "/").replace(/^[A-Za-z]:/, "");

export type World = {
	cwd: string;
	/** Files that exist before the test (path → text). */
	seed: Record<string, string>;
	/** What the core answers to a tool call that reaches it. */
	answer: Record<string, unknown>;
};

export const fresh = (over: Partial<World> = {}): World => ({ cwd: "/work/proj", seed: {}, answer: { result: "done", text: "done" }, ...over });

export type Registered = { name: string; description: string; inputSchema?: Record<string, unknown> };

/** Hooks can be registered only before the test first uses `$`; a test changes `w.seed`/`files` between calls. */
export function setup(on: On, w: World) {
	const files = new Map<string, string>(Object.entries(w.seed));
	const registered: Registered[] = [];
	on("fs.exists", (_$, e) => ({ value: files.has(norm(e.path)) }));
	on("fs.read", (_$, e) => {
		const text = files.get(norm(e.path));
		if (text === undefined) throw new Error("ENOENT");
		return { value: text };
	});
	on("fs.write", (_$, e) => {
		files.set(norm(e.path), e.text);
		return { value: undefined };
	});
	on("session.cwd", () => ({ value: w.cwd }));
	on("session.start", (_$, e) => ({ cwd: e.cwd }));
	on("tool.register", (_$, e) => {
		registered.push(e as unknown as Registered);
		return { value: { tool: `mcp__cc-herdr-plugin-dev__${(e as { name: string }).name}` } } as never;
	});
	on("command.register", (_$, e) => ({ value: { command: e.name } }));
	on("ui.log", () => ({ value: undefined }));
	on("tool.call", () => w.answer as never);
	return { files, registered };
}

type Caller = { tool: { call: (a: never) => Promise<unknown> } };

export const call = ($: Caller, input: Record<string, unknown>) => $.tool.call(input as never) as Promise<Record<string, unknown>>;

export const textOf = (r: Record<string, unknown>): string => String(r.text ?? r.result ?? r.deny ?? "");
