// The audit sidecar (shared/audit.ts) through the real flow: a recall prompt and the rules section, mock fs/env.

import { expect, mock, test } from "claude-code/testing";
import type { On } from "claude-code";

/** The engine hands the plugin `X:\…` paths on Windows; the fs mocks know POSIX keys. */
const norm = (p: string): string => p.replace(/\\/g, "/").replace(/^[A-Za-z]:/, "");

const fact = (id: string) => ({ id, title: `Fact ${id}`, fact_type: "decision", scope: { Project: "app" }, snippet: `Snippet ${id}` });

type Opts = { env: Record<string, string>; seed?: Record<string, string>; repo?: string | null; breakFs?: boolean };

function setup(on: On, o: Opts) {
	const files = new Map<string, string>(Object.entries(o.seed ?? {}));
	const written: string[] = [];
	const rules = [{ id: "RULE1", title: "R", fact_type: "decision", body: "b" }, { id: "RULE2", title: "P", fact_type: "pattern", body: "b" }];
	on("env.get", (_$, e) => ({ value: o.env[e.name] }));
	mock.store(on, { settings: { recall: true, writeGate: "ask", append: true, lang: "en" } });
	on("session.start", (_$, e) => ({ cwd: e.cwd }));
	on("command.register", () => ({ value: { command: "uma" } }));
	on("ui.status", () => ({ value: undefined }));
	on("ui.log", () => ({ value: undefined }));
	on("session.cwd", () => ({ value: "/code/wt" }));
	on("session.root", () => ({ value: "/code/wt" }));
	on("session.repo", () => ({ value: o.repo === null ? null : { root: o.repo ?? "/code/main", remote: null, internal: false, name: null } }));
	on("session.id", () => ({ value: "abcdef12-3456" }));
	on("clock.now", () => ({ value: new Date(2026, 5, 15, 12).getTime() }));
	on("fs.exists", (_$, e) => ({ value: files.has(norm(e.path)) }));
	on("fs.read", (_$, e) => ({ value: files.get(norm(e.path)) ?? "" }));
	on("fs.list", (_$, e) => ({ value: [...files.keys()].filter((f) => f.startsWith(`${norm(e.path).replace(/\/+$/, "")}/`)).map((f) => ({ name: f.split("/").pop(), kind: "file", size: 1, mtimeMs: 1, isLink: false })) }) as never);
	on("fs.write", (_$, e) => {
		if (o.breakFs) throw new Error("disk full");
		files.set(norm(e.path), e.text);
		written.push(e.path);
		return { value: undefined };
	});
	on("process.run", (_$, e) => {
		const isRecall = e.argv[1] === "recall";
		const stdout = isRecall
			? JSON.stringify({ search: true, judged_by: "jev", fact_types: [], recalled: 2, facts: [fact("A"), fact("B")], note: null })
			: JSON.stringify(e.argv.includes("decision") ? [rules[0]] : [rules[1]]);
		return { value: { exitCode: 0, stdout, stderr: "", isStdoutTruncated: false, isStderrTruncated: false } } as never;
	});
	on("prompt.submit", (_$, e) => ({ text: e.text, context: e.context }) as never);
	on("prompt.compose", () => ({ sections: [] }));
	return { files, written };
}

type Host = {
	prompt: { submit: (a: never) => Promise<unknown>; compose: (a: never) => Promise<unknown> };
	session: { start: (a: never) => Promise<unknown> };
};
const begin = ($: Host) => $.session.start({ cwd: "/code/wt", surface: "terminal", isInteractive: true } as never);
const lines = (text: string | undefined) => (text ?? "").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

const TS = new Date(2026, 5, 15, 12).getTime();
const DIR = "/home/t/.local/share/uma/agent-watchdog/main";

test("recall and rules each leave a line with fact ids only, in the main repo's folder", async ($, on) => {
	const s = setup(on, { env: { HOME: "/home/t", CC_ROLE: "coder" } });
	await begin($);
	await $.prompt.submit({ text: "proč VSA?", asUser: true } as never);
	const request = { model: "m", promptModel: "m", surfaces: [], tools: [], outputStyle: null, traits: [] } as never;
	await $.prompt.compose(request);
	await $.prompt.compose(request); // the second request reuses the cached rules: no second line
	expect(lines(s.files.get(`${DIR}/2026-06-15_coder_abcdef12.uma.jsonl`))).toEqual([
		{ ts: TS, session: "abcdef12-3456", kind: "uma-context", source: "recall", factIds: ["A", "B"], scope: "prompt" },
		{ ts: TS, session: "abcdef12-3456", kind: "uma-context", source: "rules", factIds: ["RULE1", "RULE2"], scope: "session" },
	]);
	expect(JSON.stringify([...s.files.values()])).not.toContain("Snippet");
});

test("Windows: %APPDATA%\\uma\\agent-watchdog", async ($, on) => {
	const s = setup(on, { env: { APPDATA: "C:\\Users\\t\\AppData\\Roaming" } });
	await begin($);
	await $.prompt.submit({ text: "q", asUser: true } as never);
	expect(s.written).toHaveLength(1);
	expect(s.written[0]).toContain("C:\\Users\\t\\AppData\\Roaming\\uma\\agent-watchdog\\main\\2026-06-15_orchestrator_abcdef12.uma.jsonl");
});

test("XDG_DATA_HOME wins over the home default", async ($, on) => {
	const s = setup(on, { env: { XDG_DATA_HOME: "/xdg", HOME: "/home/t" } });
	await begin($);
	await $.prompt.submit({ text: "q", asUser: true } as never);
	expect(s.written).toEqual(["/xdg/uma/agent-watchdog/main/2026-06-15_orchestrator_abcdef12.uma.jsonl"]);
});

test("the date and role of this session's watchdog ledger are reused", async ($, on) => {
	const s = setup(on, { env: { HOME: "/home/t" }, seed: { [`${DIR}/2026-06-14_tester_abcdef12.jsonl`]: "{}\n" } });
	await begin($);
	await $.prompt.submit({ text: "q", asUser: true } as never);
	expect(s.written[0]).toBe(`${DIR}/2026-06-14_tester_abcdef12.uma.jsonl`);
});

test("outside git the work tree's folder names the project", async ($, on) => {
	const s = setup(on, { env: { HOME: "/home/t" }, repo: null });
	await begin($);
	await $.prompt.submit({ text: "q", asUser: true } as never);
	expect(s.written[0]).toContain("/agent-watchdog/wt/2026-06-15_orchestrator_");
});

test("no home, or a failing disk: the prompt still goes through and nothing is thrown", async ($, on) => {
	const none = setup(on, { env: {} });
	await begin($);
	const r = (await $.prompt.submit({ text: "q", asUser: true } as never)) as { context?: string[] };
	expect(none.written).toEqual([]);
	expect(r.context?.[0]).toContain("Fact A");
});

test("a failing disk does not touch the prompt", async ($, on) => {
	setup(on, { env: { HOME: "/home/t" }, breakFs: true });
	await begin($);
	const r = (await $.prompt.submit({ text: "q", asUser: true } as never)) as { context?: string[] };
	expect(r.context?.[0]).toContain("Fact A");
});
