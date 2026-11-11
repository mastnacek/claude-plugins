// debt through the engine: turn.start / turn.complete with a faked `uma debt check`.

import { expect, mock, test } from "claude-code/testing";
import type { On } from "claude-code";

type Run = { exitCode: number; stdout: string; stderr: string } | "missing";

const report = (blocking: number) => ({ exitCode: 0, stdout: JSON.stringify({ blocking, reminder: blocking ? `Outstanding debts: ${blocking}` : "" }), stderr: "" });
const NOT_GIT = { exitCode: 1, stdout: "", stderr: "Error: The debt ledger is bound to a git working tree\nmore" };

/** `runs` answers successive `uma` calls (the last repeats); returns what was run, submitted and logged. */
function setup(on: On, runs: Run[]) {
	mock.store(on);
	mock.env(on, { HOME: "/home/t" });
	on("session.cwd", () => ({ value: "/work/app" }));
	const seen = { argv: [] as string[][], cwd: [] as unknown[], submitted: [] as string[], logs: [] as string[] };
	on("process.run", (_$, e) => {
		seen.argv.push([...e.argv]);
		seen.cwd.push(e.init?.cwd);
		const run = runs[Math.min(seen.argv.length - 1, runs.length - 1)] as Run;
		if (run === "missing") throw new Error("spawn uma ENOENT");
		return { value: { ...run, isStdoutTruncated: false, isStderrTruncated: false } } as never;
	});
	on("ui.log", (_$, e) => {
		seen.logs.push(e.text);
		return { value: undefined };
	});
	on("prompt.submit", (_$, e) => {
		seen.submitted.push(e.text);
		return { text: e.text } as never;
	});
	on("turn.complete", (_$, e) => ({ text: e.answer }));
	on("turn.start", (_$, e) => ({ turnId: e.turnId }) as never);
	return seen;
}

type Host = { turn: { start: (a: never) => Promise<unknown>; complete: (a: never) => Promise<unknown> } };

let n = 0;
const start = ($: Host, agentId?: string) => $.turn.start({ text: "úkol", turnId: `t${++n}`, ...(agentId ? { agentId } : {}) } as never);
const complete = ($: Host, extra: Record<string, unknown> = {}) => $.turn.complete({ answer: "hotovo", durationMs: 1, isAborted: false, turnId: `t${n}`, reason: "answer", ...extra } as never);
/** One turn of the main agent, the user's or a continuation of ours. */
async function turn($: Host, extra: Record<string, unknown> = {}) {
	await start($);
	await complete($, extra);
	await Promise.resolve();
}

test("no debts: nothing is submitted or logged; the check runs in the session's cwd", async ($, on) => {
	const seen = setup(on, [report(0)]);
	await turn($);
	expect(seen.submitted).toEqual([]);
	expect(seen.logs).toEqual([]);
	expect(seen.argv).toEqual([["uma", "debt", "check", "--origin", "claude-code", "--json"]]);
	expect(seen.cwd).toEqual(["/work/app"]);
});

test("blocking debts: the reminder goes to the model as a prompt so it continues", async ($, on) => {
	const seen = setup(on, [report(2)]);
	await turn($);
	expect(seen.submitted).toEqual(["Outstanding debts: 2"]);
	expect(seen.logs).toEqual([]);
});

test("a run spends at most two reminders; the third end of turn only logs one line", async ($, on) => {
	const seen = setup(on, [report(1)]);
	await turn($); // the user's prompt
	await turn($); // continuation 1
	await turn($); // continuation 2
	expect(seen.submitted).toHaveLength(2);
	expect(seen.logs).toEqual(["Otevřených blokujících dluhů: 1 — připomínky tohoto běhu jsou vyčerpané, viz /uma debt list"]);
});

test("a new user prompt starts a new run: the counter is back at zero", async ($, on) => {
	const seen = setup(on, [report(1)]);
	await turn($);
	await turn($);
	await turn($); // cap spent, logged
	// The person's own prompt: the previous end of turn spent nothing, so this start is not a continuation.
	await $.turn.start({ text: "další", turnId: "u1" } as never);
	await complete($, { turnId: "u1" });
	expect(seen.submitted).toHaveLength(3);
});

test("a subagent's turn does nothing and does not touch the counter", async ($, on) => {
	const seen = setup(on, [report(3)]);
	await start($, "agent-1");
	await complete($, { agentId: "agent-1" });
	expect(seen.argv).toEqual([]);
	expect(seen.submitted).toEqual([]);
});

test("an interrupted turn does not push the model, but the check still ran", async ($, on) => {
	const seen = setup(on, [report(1)]);
	await turn($, { reason: "aborted", isAborted: true });
	expect(seen.submitted).toEqual([]);
});

test("missing binary or no git repo: silent for the model, one log line per series", async ($, on) => {
	const seen = setup(on, ["missing", NOT_GIT, report(0)]);
	await turn($);
	await turn($);
	expect(seen.submitted).toEqual([]);
	expect(seen.logs).toHaveLength(1);
	expect(seen.logs[0]).toContain("dluhy se nepodařilo zkontrolovat:");
	await turn($); // recovers
	expect(seen.logs).toHaveLength(1);
});

test("unreadable output counts as a failure, not as debts", async ($, on) => {
	const seen = setup(on, [{ exitCode: 0, stdout: "nonsense", stderr: "" }]);
	await turn($);
	expect(seen.submitted).toEqual([]);
	expect(seen.logs).toEqual(["dluhy se nepodařilo zkontrolovat: uma vrátila nečitelnou odpověď"]);
});

test("label: ⚖N under the prompt while blocking debts are open, refreshed after each turn", async ($, on) => {
	setup(on, [report(2), report(0)]);
	on("session.start", (_$, e) => ({ cwd: e.cwd }));
	on("command.register", () => ({ value: { command: "uma" } }));
	on("ui.status", () => ({ value: undefined }));
	on("fs.exists", () => ({ value: false }));
	let tail: string | undefined;
	on("ui.render", { component: "PromptHint" }, async (_$, e, next) => {
		tail = e.props.tail;
		return next(e);
	});
	const mount = () => $.ui.mount({ plugin: "cc-uma-memory", surface: "terminal", component: "PromptHint", props: { isDraft: false, isWorking: false, hint: "?", tail: "" } });
	await $.session.start({ cwd: "/work/app", surface: "terminal", isInteractive: true });
	await mount();
	expect(tail).toBe("[💾 🟡 UMA ⚠ CC]");
	await turn($);
	await mount();
	expect(tail).toBe("[💾 🔴 UMA ⚠ CC ⚖2]");
	await turn($);
	await mount();
	expect(tail).toBe("[💾 🟡 UMA ⚠ CC]");
});

test("label: /uma debt clear refreshes it at once, without waiting for the next turn", async ($, on) => {
	setup(on, [report(2), { exitCode: 0, stdout: "Cleared 2 debt(s).", stderr: "" }, report(0)]);
	on("session.start", (_$, e) => ({ cwd: e.cwd }));
	on("command.register", () => ({ value: { command: "uma" } }));
	on("ui.status", () => ({ value: undefined }));
	on("fs.exists", () => ({ value: false }));
	let tail: string | undefined;
	on("ui.render", { component: "PromptHint" }, async (_$, e, next) => {
		tail = e.props.tail;
		return next(e);
	});
	const mount = () => $.ui.mount({ plugin: "cc-uma-memory", surface: "terminal", component: "PromptHint", props: { isDraft: false, isWorking: false, hint: "?", tail: "" } });
	await $.session.start({ cwd: "/work/app", surface: "terminal", isInteractive: true });
	await turn($);
	await mount();
	expect(tail).toBe("[💾 🔴 UMA ⚠ CC ⚖2]");
	await $.command.run({ command: "uma", args: "debt clear", origin: { kind: "composer" }, presentation: { isFullscreen: false, columns: 80 } });
	await mount();
	expect(tail).toBe("[💾 🟡 UMA ⚠ CC]");
});
