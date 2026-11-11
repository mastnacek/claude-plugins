// store.ts — where the ledger lives and how it is written and read.
//
//   <root>/<project>/<YYYY-MM-DD>_<role>_<first 8 of session id>.jsonl
//
//   root     beside UMA's global memory (never inside its `global/` folder):
//            Windows (APPDATA set)  %APPDATA%\uma\agent-watchdog
//            XDG_DATA_HOME set      $XDG_DATA_HOME/uma/agent-watchdog
//            macOS (~/Library/Application Support exists)
//                                   ~/Library/Application Support/uma/agent-watchdog
//            else                   ~/.local/share/uma/agent-watchdog
//   project  name of the MAIN repository (`$.session.repo()` root), so a worktree
//            and the main checkout write to the same folder
//
// The engine can only write whole files, so an append is read + write; calls are
// chained so parallel tool calls never lose a line. A resumed session finds its
// file again by the id suffix; a new id (after /clear) starts a new file.

import type { EngineInterface } from "claude-code";
import { homeDir } from "./home";
import { baseName, canon } from "./paths";
import type { Ev, Role } from "./types";

type $ = EngineInterface;

const FILE_RE = /^(\d{4}-\d{2}-\d{2})_(orchestrator|coder|tester)_([A-Za-z0-9]{1,8})\.jsonl$/;
const MAX_BYTES = 3_500_000;

export type LogRef = { path: string; dir: string; project: string; workdir: string; session: string };

export type LogFile = { path: string; name: string; date: string; role: Role; sid8: string; mtimeMs: number };

const clean = (v: string | undefined): string | undefined => v?.trim() || undefined;
const join = (base: string, ...parts: string[]): string => `${base.replace(/[\\/]+$/, "")}${base.includes("\\") ? "\\" : "/"}${parts.join(base.includes("\\") ? "\\" : "/")}`;

/** The folder all projects' ledgers live in; undefined when no home can be found. */
export async function logRoot($: $): Promise<string | undefined> {
	const roaming = clean(await $.env.get("APPDATA"));
	if (roaming) return join(roaming, "uma", "agent-watchdog");
	const xdg = clean(await $.env.get("XDG_DATA_HOME"));
	if (xdg) return join(xdg, "uma", "agent-watchdog");
	const home = await homeDir($);
	if (!home) return undefined;
	const support = join(home, "Library", "Application Support");
	if (await $.fs.exists(support).catch(() => false)) return join(support, "uma", "agent-watchdog");
	return join(home, ".local", "share", "uma", "agent-watchdog");
}

const safe = (name: string): string => name.replace(/[^\w.-]/g, "_") || "project";

/**
 * Project name and work tree of the session. The project is the MAIN repository's
 * folder name (`$.session.repo()` answers the main working tree's root, also from a
 * worktree), so a worktree and the main checkout share one ledger folder; outside git
 * it is the session root's folder name. The work tree is the session's root.
 */
export async function repoInfo($: $, cwd: string): Promise<{ project: string; workdir: string }> {
	let root = cwd;
	let main: string = cwd;
	try {
		root = await $.session.root();
		main = (await $.session.repo())?.root ?? root;
	} catch {
		// no session info (or no git): the folder name stands
	}
	return { project: safe(baseName(main)), workdir: canon(root) };
}

export async function listLogs($: $, dir: string): Promise<LogFile[]> {
	try {
		const entries = await $.fs.list(dir);
		const files: LogFile[] = [];
		for (const e of entries) {
			const m = FILE_RE.exec(e.name);
			if (m && e.kind === "file") files.push({ path: join(dir, e.name), name: e.name, date: m[1] as string, role: m[2] as Role, sid8: m[3] as string, mtimeMs: e.mtimeMs });
		}
		return files.sort((a, b) => a.mtimeMs - b.mtimeMs);
	} catch {
		return [];
	}
}

/** The file name chosen for a session in a folder: it must not change while the session runs (the date would). */
const names = new Map<string, string>();

const today = (ms: number): string => {
	const d = new Date(ms);
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** The ledger file of this session (found again after a resume, new after /clear); undefined without a home. */
export async function openLog($: $, session: string, role: Role, cwd: string): Promise<LogRef | undefined> {
	const root = await logRoot($);
	if (!root) return undefined;
	const { project, workdir } = await repoInfo($, cwd);
	const dir = join(root, project);
	const sid8 = session.replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "unknown";
	const key = `${dir}\n${session}`;
	let name = names.get(key);
	if (!name) {
		name = (await listLogs($, dir)).find((f) => f.sid8 === sid8)?.name ?? `${today(await $.clock.now())}_${role}_${sid8}.jsonl`;
		names.set(key, name);
	}
	return { path: join(dir, name), dir, project, workdir, session };
}

let chain: Promise<unknown> = Promise.resolve();

/** Adds one line to the ledger file. Rejects (the caller logs it); never throws into the tool. */
export function appendEvent($: $, ref: LogRef, ev: Ev): Promise<void> {
	const job = async () => {
		const old = (await $.fs.exists(ref.path)) ? String(await $.fs.read(ref.path)) : "";
		if (old.length > MAX_BYTES) throw new Error("deník je plný (3,5 MB)");
		await $.fs.write(ref.path, `${old}${JSON.stringify(ev)}\n`);
	};
	const run = chain.then(job);
	chain = run.catch(() => undefined);
	return run;
}

export function parseEvents(text: string): Ev[] {
	const out: Ev[] = [];
	for (const line of text.split("\n")) {
		if (!line.trim()) continue;
		try {
			const ev = JSON.parse(line) as Ev;
			if (ev && typeof ev === "object" && typeof ev.kind === "string") out.push(ev);
		} catch {
			// a torn line is skipped
		}
	}
	return out;
}

export async function readEvents($: $, path: string): Promise<Ev[]> {
	try {
		return (await $.fs.exists(path)) ? parseEvents(String(await $.fs.read(path))) : [];
	} catch {
		return [];
	}
}
