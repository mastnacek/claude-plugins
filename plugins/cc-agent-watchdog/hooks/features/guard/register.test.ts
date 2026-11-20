// guard through the engine: block mode refuses before the call runs; an exception lets it through; fail-open.

import { expect, mock, test } from "claude-code/testing";
import type { On } from "claude-code";
import { eventsOf, fresh, only, setup } from "../../shared/world";
import type { World } from "../../shared/world";
import type { ToolEv } from "../../shared/types";

const TOOL = "mcp__cc-agent-watchdog__watchdog_waiver";
const CONFIG = "/work/wt/.claude/watchdog.json";
const SED = "sed -i 's/a/b/' /work/wt/src/a.ts";

type Host = {
	session: { start: (a: never) => Promise<unknown> };
	turn: { complete: (a: never) => Promise<unknown> };
	tool: { call: (a: never) => Promise<Record<string, unknown>> };
};

/** `project` is the text of .claude/watchdog.json, `global` what the user's store holds. */
function boot(on: On, over: { project?: object; global?: object; answer?: string; role?: "coder" | "" } = {}) {
	const w: World = fresh({ env: { HOME: "/h", CC_ROLE: over.role ?? "coder" }, session: "GUARD001-x", tick: 1000, seed: over.project ? { [CONFIG]: JSON.stringify(over.project) } : {} });
	const asked: string[] = [];
	on("tool.call", { tool: "AskUserQuestion" }, (_$, e) => {
		const q = e.questions[0]?.question ?? "";
		asked.push(q);
		return { result: { questions: e.questions, answers: { [q]: over.answer ?? "✅ Povolit" } } } as never;
	});
	mock.store(on, over.global ? { rules: over.global } : {});
	on("tool.register", (_$, e) => ({ value: { tool: `mcp__cc-agent-watchdog__${(e as { name: string }).name}` } }) as never);
	on("turn.complete", (_$, e) => ({ text: e.answer }));
	const world = setup(on, w);
	return { w, asked, ...world };
}

const start = ($: Host) => $.session.start({ cwd: "/work/wt", surface: "terminal", isInteractive: true } as never);
const bash = ($: Host, command: string) => $.tool.call({ tool: "Bash", command } as never);
const endTurn = ($: Host) => $.turn.complete({ answer: "Pracuji.", durationMs: 1, isAborted: false, turnId: "t1", reason: "answer" } as never);
const ran = (r: Record<string, unknown>) => r.deny === undefined;
const tools = (files: Map<string, string>) => eventsOf(files, only(files));

const BLOCK_W29 = { rules: { W29: { enabled: true, mode: "block" } } };

test("default is report: nothing is refused, even a rule that breaks", async ($, on) => {
	boot(on, { project: { rules: { W29: { enabled: true } } } });
	await start($ as never);
	expect(ran(await bash($ as never, SED))).toBe(true);
});

test("block: the call is refused BEFORE it runs, with the rule, the right way and the waiver tool; the ledger records the denial", async ($, on) => {
	const { files } = boot(on, { project: BLOCK_W29 });
	await start($ as never);
	const r = await bash($ as never, SED);
	expect(r.deny).toMatch(/^W29: .*\. Použij nástroj Write nebo Edit, nebo požádej o výjimku nástrojem watchdog_waiver\.$/);
	expect(r.text).toBeUndefined(); // the tool's own answer ("ok") never came: it did not run
	const [ev] = tools(files) as ToolEv[];
	expect(ev).toMatchObject({ tool: "Bash", denied: true, isError: true, blocked: true });
	expect(ev?.deniedReason).toMatch(/^W29:/);
	expect(await bash($ as never, "ls")).toMatchObject({ text: "ok" }); // other calls are untouched
	expect(await $.tool.call({ tool: "Write", file_path: "/work/wt/x.ts", content: "x" } as never)).toMatchObject({ text: "ok" });
});

test("a refusal by block mode is no W19 bypass: Edit of the same file right after it keeps the score clean", async ($, on) => {
	const { w } = boot(on, { project: BLOCK_W29 });
	await start($ as never);
	await bash($ as never, SED);
	await $.tool.call({ tool: "Edit", file_path: "/work/wt/src/a.ts", old_string: "a", new_string: "b" } as never);
	w.answer = { result: {}, text: "ok" };
	await endTurn($ as never);
	const tag = await ($ as unknown as { command: { run: (a: never) => Promise<{ text?: string }> } }).command.run({ command: "watch", args: "report", origin: { kind: "composer" }, presentation: { isFullscreen: false, columns: 80 } } as never);
	expect(tag.text).not.toContain("instant");
	expect(tag.text).toMatch(/skóre \d+\/100/);
	expect(tag.text).not.toMatch(/skóre 0\//);
});

test("block with an exception: the dialog allows, the call runs; the exception ends with the turn", async ($, on) => {
	const { asked } = boot(on, { project: BLOCK_W29 });
	await start($ as never);
	expect(ran(await bash($ as never, SED))).toBe(false);
	const given = await $.tool.call({ tool: TOOL, rule: "W29", reason: "mechanická hromadná úprava" } as never);
	expect(String(given.text)).toContain("povolena");
	expect(asked).toHaveLength(1);
	expect(ran(await bash($ as never, SED))).toBe(true);
	expect(ran(await bash($ as never, SED))).toBe(true);
	await endTurn($ as never);
	expect(ran(await bash($ as never, SED))).toBe(false);
});

test("scope.calls: the exception covers exactly that many calls", async ($, on) => {
	boot(on, { project: BLOCK_W29 });
	await start($ as never);
	await $.tool.call({ tool: TOOL, rule: "W29", reason: "mechanická hromadná úprava", scope: { calls: 2 } } as never);
	expect([ran(await bash($ as never, SED)), ran(await bash($ as never, SED)), ran(await bash($ as never, SED))]).toEqual([true, true, false]);
});

test("a refused request leaves the block in force", async ($, on) => {
	boot(on, { project: BLOCK_W29, answer: "❌ Zamítnout" });
	await start($ as never);
	await $.tool.call({ tool: TOOL, rule: "W29", reason: "mechanická hromadná úprava" } as never);
	expect(ran(await bash($ as never, SED))).toBe(false);
});

test("an instant-failure rule in block mode: refused, the exception is refused without a dialog, the call stays refused", async ($, on) => {
	const { asked } = boot(on, { project: { rules: { W01: { mode: "block" } } } });
	await start($ as never);
	const r = await bash($ as never, "git commit -m x");
	expect(r.deny).toMatch(/^W01: .*výjimku u tohoto pravidla nelze udělit/);
	expect(String((await $.tool.call({ tool: TOOL, rule: "W01", reason: "opravdu to potřebuju" } as never)).text)).toContain("instant failure");
	expect(asked).toEqual([]);
	expect(ran(await bash($ as never, "git commit -m x"))).toBe(false);
});

test("the orchestrator is never refused, whatever the settings", async ($, on) => {
	boot(on, { project: { rules: { W01: { mode: "block" } } }, role: "" });
	await start($ as never);
	expect(ran(await bash($ as never, "git commit -m x"))).toBe(true);
});

test("a rule that cannot be judged beforehand stays report even if the file says block", async ($, on) => {
	boot(on, { project: { rules: { W08: { mode: "block" } } } });
	await start($ as never);
	expect(ran(await bash($ as never, "rm -rf /work/wt/node_modules_x"))).toBe(true);
});

test("settings: a global block applies without any project file", async ($, on) => {
	boot(on, { global: { W29: { enabled: true, mode: "block" } } });
	await start($ as never);
	expect(ran(await bash($ as never, SED))).toBe(false);
});

test("settings: the project's report beats the global block", async ($, on) => {
	boot(on, { global: { W29: { enabled: true, mode: "block" } }, project: { rules: { W29: { mode: "report" } } } });
	await start($ as never);
	expect(ran(await bash($ as never, SED))).toBe(true);
});

test("settings: the old `profile` still switches the rule on, and a block there works", async ($, on) => {
	boot(on, { project: { profile: ["W29"], rules: { W29: { mode: "block" } } } });
	await start($ as never);
	expect(ran(await bash($ as never, SED))).toBe(false);
});

test("fail-open: when judging fails the call goes through and one log line says so", async ($, on) => {
	const { logged, w } = boot(on, { project: BLOCK_W29 });
	await start($ as never);
	expect(ran(await bash($ as never, SED))).toBe(false);
	w.breakSession = true;
	const r = await bash($ as never, SED);
	expect(ran(r)).toBe(true);
	expect(logged.some((l) => l.startsWith("blokace: vyhodnocení selhalo"))).toBe(true);
});
