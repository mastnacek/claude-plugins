// world.ts — a pretend machine for tests that drive the whole plugin (only *.test.ts files import it):
// an in-memory file system, a session, a clock, `git status`, and a tool that answers what the test says.

import type { On } from "claude-code";
import { parseEvents } from "./store";
import type { ToolEv } from "./types";

export type Entry = { name: string; kind: "file"; size: number; mtimeMs: number; isLink: boolean };

export type World = {
	env: Record<string, string>;
	dirs: string[];
	listing: Entry[];
	repo: string | null;
	root: string;
	session: string;
	answer: Record<string, unknown>;
	breakFs: boolean;
	/** What `git status --porcelain` prints. */
	status: string;
	/** Files that exist before the test (path → text), e.g. `.claude/watchdog.json`. */
	seed: Record<string, string>;
};

export const fresh = (over: Partial<World> = {}): World => ({ env: { HOME: "/home/t" }, dirs: [], listing: [], repo: "/work/main", root: "/work/wt", session: "01HZABCD-EFGH-1234", answer: { result: {}, text: "ok" }, breakFs: false, status: "", seed: {}, ...over });

/** Strips a Windows drive letter and backslashes, as the engine's test mapping needs. */
export const norm = (p: string): string => p.replace(/\\/g, "/").replace(/^[A-Za-z]:/, "");

/**
 * Hooks can be registered only before the test first uses `$`, so a test registers
 * them once, over a world it changes between calls. Returns the files written and the log lines.
 */
export function setup(on: On, w: World) {
	const files = new Map<string, string>(Object.entries(w.seed));
	const logged: string[] = [];
	on("env.get", (_$, e) => ({ value: w.env[e.name] }));
	on("fs.exists", (_$, e) => ({ value: files.has(norm(e.path)) || w.dirs.includes(norm(e.path)) }));
	on("fs.read", (_$, e) => ({ value: files.get(norm(e.path)) ?? "" }));
	on("fs.write", (_$, e) => {
		if (w.breakFs) throw new Error("disk full");
		files.set(norm(e.path), e.text);
		return { value: undefined };
	});
	on("fs.list", (_$, e) => {
		const dir = norm(e.path).replace(/\/+$/, "");
		const written: Entry[] = [...files.keys()].filter((p) => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes("/")).map((p, i) => ({ name: p.slice(dir.length + 1), kind: "file", size: (files.get(p) ?? "").length, mtimeMs: 10 + i, isLink: false }));
		return { value: [...w.listing, ...written.filter((f) => !w.listing.some((l) => l.name === f.name))] };
	});
	on("clock.now", () => ({ value: new Date(2026, 0, 5, 12).getTime() }));
	on("session.id", () => ({ value: w.session }));
	on("session.cwd", () => ({ value: w.root }));
	on("session.root", () => ({ value: w.root }));
	on("session.repo", () => ({ value: w.repo === null ? null : { root: w.repo, remote: null, internal: false, name: null } }));
	on("process.run", () => ({ value: { exitCode: 0, stdout: w.status, stderr: "" } }) as never);
	on("session.start", (_$, e) => ({ cwd: e.cwd }));
	on("command.register", () => ({ value: { command: "watch" } }));
	on("ui.log", (_$, e) => {
		logged.push(String((e as unknown as { text: string }).text));
		return { value: undefined };
	});
	on("tool.call", () => w.answer as never);
	return { files, logged };
}

type Caller = { tool: { call: (a: never) => Promise<unknown> } };

export const call = ($: Caller, input: Record<string, unknown>) => $.tool.call(input as never) as Promise<Record<string, unknown>>;

export const eventsOf = (files: Map<string, string>, path: string): ToolEv[] => parseEvents(files.get(path) ?? "") as ToolEv[];

/** The path of the one file written. */
export function only(files: Map<string, string>): string {
	const keys = [...files.keys()].filter((k) => k.endsWith(".jsonl"));
	if (keys.length !== 1) throw new Error(`expected one ledger file, found ${keys.length}`);
	return keys[0] as string;
}
