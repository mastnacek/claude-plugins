// humility through the engine: the uma_humility result, Read, Write/Edit hooks, a faked transcript.
// No network, no real tool.

import { expect, mock, test } from "claude-code/testing";
import type { On } from "claude-code";

const TOOL = "mcp__plugin_cc-uma-memory_uma__uma_humility";
const LOW = { familiarity: "low", exploration_required: true, fact_coverage: 0, advice: "x", required_reads: 3 };
const HIGH = { familiarity: "high", exploration_required: false, fact_coverage: 4, advice: "x", required_reads: 3 };
const HYPOTHESIS = "Hypothesis: the parser keeps a token queue per session and flushes it on close";

type Opts = { humility?: boolean; verdict?: unknown; messages?: Array<{ role: "user" | "assistant"; text: string }>; sessionId?: string };

function setup(on: On, o: Opts = {}) {
	const store = new Map<string, unknown>([["settings", { recall: true, writeGate: "ask", append: true, immune: "warn", immuneModel: "", humility: o.humility ?? true }]]);
	on("store.get", (_$, e) => ({ value: store.get(e.key) }));
	on("store.set", (_$, e) => {
		store.set(e.key, JSON.parse(JSON.stringify(e.value)));
		return { value: undefined };
	});
	mock.env(on, { HOME: "/h" });
	const t = { sessionId: o.sessionId ?? "s1", messages: [...(o.messages ?? [])] };
	on("session.start", (_$, e) => ({ cwd: e.cwd }));
	on("session.cwd", () => ({ value: "/w" }));
	on("session.id", () => ({ value: t.sessionId }));
	on("session.messages", () => ({ value: t.messages.map((m) => ({ ...m, toolUses: [] })) }) as never);
	on("command.register", () => ({ value: { command: "uma" } }));
	on("ui.status", () => ({ value: undefined }));
	on("ui.log", () => ({ value: undefined }));
	on("fs.exists", () => ({ value: false }));
	on("fs.stat", () => {
		throw new Error("ENOENT");
	});
	on("process.run", () => ({ value: { exitCode: 1, stdout: "", stderr: "", isStdoutTruncated: false, isStderrTruncated: false } }) as never);
	const ran: string[] = [];
	on("tool.call", (_$, e) => {
		ran.push(String(e.tool));
		if ((e.tool as string) === TOOL) return { result: "ok", text: JSON.stringify(o.verdict ?? LOW) } as never;
		return { result: "ran" } as never;
	});
	return { t, ran, store };
}

type Call = { tool: { call: (a: never) => Promise<{ deny?: string; context?: readonly string[] }> } };
const start = ($: { session: { start: (a: never) => Promise<unknown> } }) => $.session.start({ cwd: "/w", surface: "terminal", isInteractive: true } as never);
const check = ($: Call, files: string[] = ["/w/src/a.ts"], intent = "refactor the parser") => $.tool.call({ tool: TOOL, intent, files } as never);
const readFile = ($: Call, file_path: string) => $.tool.call({ tool: "Read", file_path } as never);
const write = ($: Call, file_path: string) => $.tool.call({ tool: "Write", file_path, content: "x" } as never);
const edit = ($: Call, file_path: string) => $.tool.call({ tool: "Edit", file_path, old_string: "a", new_string: "b" } as never);
const run = ($: { command: { run: (a: never) => Promise<unknown> } }, args: string) =>
	$.command.run({ command: "uma", args, origin: { kind: "composer" }, presentation: { isFullscreen: false, columns: 80 } } as never) as Promise<{ text?: string }>;

test("off (the default): a LOW verdict changes nothing, edits pass", async ($, on) => {
	const { ran } = setup(on, { humility: false });
	await start($);
	await check($);
	expect((await write($, "/w/src/a.ts")).deny).toBeUndefined();
	expect(ran).toContain("Write");
});

test("on, without any uma_humility call: nothing is gated", async ($, on) => {
	setup(on);
	await start($);
	expect((await write($, "/w/src/a.ts")).deny).toBeUndefined();
});

test("LOW: edits in the flagged directory are denied until 3 reads, then until the hypothesis, then they run", async ($, on) => {
	const { ran, t } = setup(on);
	await start($);
	await check($);

	const first = await write($, "/w/src/a.ts");
	expect(first.deny).toContain("Read-Only Explorative Mode");
	expect(first.deny).toContain("0/3");
	expect(ran).not.toContain("Write");

	await readFile($, "/w/src/a.ts");
	await readFile($, "/w/src/a.ts"); // the same file twice is one read
	await readFile($, "src/b.ts"); // relative to the cwd
	expect((await edit($, "/w/src/c.ts")).deny).toContain("2/3");

	await readFile($, "/w/src/deep/c.ts");
	const noHypothesis = await edit($, "/w/src/a.ts");
	expect(noHypothesis.deny).toContain("no hypothesis stated");
	expect(ran).not.toContain("Edit");

	t.messages.push({ role: "assistant", text: `I read the files.\n${HYPOTHESIS}` });
	expect((await edit($, "/w/src/a.ts")).deny).toBeUndefined();
	expect(ran).toContain("Edit");
	// confirmed: no transcript needed any more
	t.messages.length = 0;
	expect((await write($, "/w/src/other.ts")).deny).toBeUndefined();
});

test("a hypothesis stated BEFORE the check does not count", async ($, on) => {
	const { t } = setup(on, { messages: [{ role: "assistant", text: HYPOTHESIS }] });
	await start($);
	await check($);
	for (const f of ["a", "b", "c"]) await readFile($, `/w/src/${f}.ts`);
	expect((await write($, "/w/src/a.ts")).deny).toContain("no hypothesis stated");
	t.messages.push({ role: "assistant", text: HYPOTHESIS });
	expect((await write($, "/w/src/a.ts")).deny).toBeUndefined();
});

test("files outside the flagged directory, and reads outside it, are not affected", async ($, on) => {
	setup(on);
	await start($);
	await check($);
	await readFile($, "/w/docs/a.md");
	await readFile($, "/w/docs/b.md");
	await readFile($, "/w/docs/c.md");
	expect((await write($, "/w/docs/x.md")).deny).toBeUndefined();
	expect((await write($, "/w/src/x.ts")).deny).toContain("0/3"); // docs reads did not count
});

test("HIGH verdict: nothing is flagged", async ($, on) => {
	setup(on, { verdict: HIGH });
	await start($);
	await check($);
	expect((await write($, "/w/src/a.ts")).deny).toBeUndefined();
});

test("a new check (new intent) starts clean: a HIGH one clears the flags, a LOW one resets the reads", async ($, on) => {
	const { t } = setup(on);
	await start($);
	await check($);
	await readFile($, "/w/src/a.ts");
	await check($, ["/w/src/a.ts"], "another thing");
	expect((await write($, "/w/src/a.ts")).deny).toContain("0/3");
	t.messages.push({ role: "assistant", text: "nothing" });
	// the same directory flagged again after confirmation is unconfirmed again
	for (const f of ["a", "b", "c"]) await readFile($, `/w/src/${f}.ts`);
	t.messages.push({ role: "assistant", text: HYPOTHESIS });
	expect((await write($, "/w/src/a.ts")).deny).toBeUndefined();
	await check($, ["/w/src/a.ts"], "yet another");
	expect((await write($, "/w/src/a.ts")).deny).toContain("0/3");
});

test("a new session forgets the flags", async ($, on) => {
	const { t } = setup(on);
	await start($);
	await check($);
	expect((await write($, "/w/src/a.ts")).deny).toBeDefined();
	t.sessionId = "s2";
	expect((await write($, "/w/src/a.ts")).deny).toBeUndefined();
});

test("required_reads comes from the verdict", async ($, on) => {
	const { t } = setup(on, { verdict: { ...LOW, required_reads: 1 } });
	await start($);
	await check($);
	await readFile($, "/w/src/a.ts");
	t.messages.push({ role: "assistant", text: HYPOTHESIS });
	expect((await write($, "/w/src/a.ts")).deny).toBeUndefined();
});

test("a verdict without files flags nothing (as in pi)", async ($, on) => {
	setup(on);
	await start($);
	await check($, []);
	expect((await write($, "/w/src/a.ts")).deny).toBeUndefined();
});

test("NotebookEdit is gated by notebook_path", async ($, on) => {
	setup(on);
	await start($);
	await check($);
	const r = await $.tool.call({ tool: "NotebookEdit", notebook_path: "/w/src/n.ipynb", new_source: "x" } as never);
	expect(r.deny).toContain("Explorative");
});

test("/uma humility on|off is stored and read back", async ($, on) => {
	const { store } = setup(on, { humility: false });
	await start($);
	expect((await run($, "humility")).text).toContain("vypnuta");
	expect((await run($, "humility on")).text).toContain("zapnuta");
	expect((store.get("settings") as { humility: boolean }).humility).toBe(true);
	await check($);
	expect((await write($, "/w/src/a.ts")).deny).toBeDefined();
	await run($, "humility off");
	expect((await write($, "/w/src/a.ts")).deny).toBeUndefined();
	expect((await run($, "humility x")).text).toContain("Neznámý");
});
