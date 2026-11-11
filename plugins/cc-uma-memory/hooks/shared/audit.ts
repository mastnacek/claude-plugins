// audit.ts — which UMA facts the model had in context, written as a sidecar file.
//
// SHARED FILE CONTRACT (the only thing cc-uma-memory and cc-agent-watchdog share; no code):
//
//   <root>/<project>/<YYYY-MM-DD>_<role>_<first 8 of session id>.uma.jsonl
//
//   root     Windows (APPDATA set)  %APPDATA%\uma\agent-watchdog
//            XDG_DATA_HOME set      $XDG_DATA_HOME/uma/agent-watchdog
//            macOS (~/Library/Application Support exists)
//                                   ~/Library/Application Support/uma/agent-watchdog
//            else                   ~/.local/share/uma/agent-watchdog
//   project  name of the MAIN repository (`$.session.repo()` root; the work tree outside git)
//   role     `CC_ROLE` = coder | tester, else orchestrator
//   line     {"ts":<ms>,"session":"<full id>","kind":"uma-context","source":"recall"|"rules",
//             "factIds":["<fact id>",…],"scope":"prompt"|"session"}   — IDs only, never fact content
//
// Same folder and name as the watchdog's ledger (`….jsonl`), so a reader pairs them by name. If the
// ledger of this session already exists its date is reused. A write never fails the caller: the
// prompt is the product, the audit trail is a side effect.

import type { EngineInterface } from "claude-code";

type $ = EngineInterface;

export type UmaContext = { source: "recall" | "rules"; factIds: readonly string[]; scope: "prompt" | "session" };

const clean = (v: string | undefined): string | undefined => v?.trim() || undefined;
const join = (base: string, ...parts: string[]): string => {
	const sep = base.includes("\\") ? "\\" : "/";
	return `${base.replace(/[\\/]+$/, "")}${sep}${parts.join(sep)}`;
};
const baseName = (p: string): string => p.replace(/\\/g, "/").replace(/\/+$/, "").split("/").pop() ?? "";
const safe = (name: string): string => name.replace(/[^\w.-]/g, "_") || "project";

async function home($: $): Promise<string | undefined> {
	return clean(await $.env.get("HOME")) ?? clean(await $.env.get("USERPROFILE"));
}

async function auditRoot($: $): Promise<string | undefined> {
	const roaming = clean(await $.env.get("APPDATA"));
	if (roaming) return join(roaming, "uma", "agent-watchdog");
	const xdg = clean(await $.env.get("XDG_DATA_HOME"));
	if (xdg) return join(xdg, "uma", "agent-watchdog");
	const h = await home($);
	if (!h) return undefined;
	const support = join(h, "Library", "Application Support");
	if (await $.fs.exists(support).catch(() => false)) return join(support, "uma", "agent-watchdog");
	return join(h, ".local", "share", "uma", "agent-watchdog");
}

async function projectName($: $): Promise<string> {
	let main: string = await $.session.cwd();
	try {
		const root = await $.session.root();
		main = (await $.session.repo())?.root ?? root;
	} catch {
		// no session info or no git: the cwd's folder name stands
	}
	return safe(baseName(main));
}

const pad = (n: number): string => String(n).padStart(2, "0");
const day = (ms: number): string => {
	const d = new Date(ms);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** The file name of a session must not change while it runs (the date would). */
const names = new Map<string, string>();
let chain: Promise<unknown> = Promise.resolve();

async function fileOf($: $, session: string): Promise<string | undefined> {
	const root = await auditRoot($);
	if (!root) return undefined;
	const dir = join(root, await projectName($));
	const sid8 = session.replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "unknown";
	const key = `${dir}\n${session}`;
	let name = names.get(key);
	if (!name) {
		let date = day(await $.clock.now());
		let roleName = "orchestrator";
		const r = clean(await $.env.get("CC_ROLE"))?.toLowerCase();
		if (r === "coder" || r === "tester") roleName = r;
		try {
			const sibling = (await $.fs.list(dir)).map((e) => new RegExp(`^(\\d{4}-\\d{2}-\\d{2})_(orchestrator|coder|tester)_${sid8}\\.(?:uma\\.)?jsonl$`).exec(e.name)).find((m) => m !== null);
			if (sibling) {
				date = sibling[1] as string;
				roleName = sibling[2] as string;
			}
		} catch {
			// no folder yet
		}
		name = `${date}_${roleName}_${sid8}.uma.jsonl`;
		names.set(key, name);
	}
	return join(dir, name);
}

/** Notes that the model was given these facts. Never throws, never blocks the prompt. */
export async function recordContext($: $, ctx: UmaContext): Promise<void> {
	if (ctx.factIds.length === 0) return;
	try {
		const session = await $.session.id();
		const path = await fileOf($, session);
		if (!path) return;
		const line = JSON.stringify({ ts: await $.clock.now(), session, kind: "uma-context", source: ctx.source, factIds: ctx.factIds, scope: ctx.scope });
		const job = async (): Promise<void> => {
			const old = (await $.fs.exists(path)) ? String(await $.fs.read(path)) : "";
			await $.fs.write(path, `${old}${line}\n`);
		};
		const run = chain.then(job);
		chain = run.catch(() => undefined);
		await run;
	} catch {
		// the audit trail is best effort
	}
}
