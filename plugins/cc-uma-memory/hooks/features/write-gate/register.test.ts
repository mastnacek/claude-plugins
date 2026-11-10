// write-gate through the engine: tool.call hooks, the dialog answered by a test hook.

import { expect, mock, test } from "claude-code/testing";
import type { On } from "claude-code";

const WRITE = "mcp__plugin_cc-uma-memory_uma__uma_write";
const SUPERSEDE = "mcp__plugin_cc-uma-memory_uma__uma_supersede";

/** The dialog answers `answer` (or fails like a -p run), records what it showed; anything that reaches the bottom "runs". */
function setup(on: On, mode: "ask" | "off", answer: string | "no-ui", stat: (path: string) => unknown = () => { throw new Error("ENOENT"); }) {
	mock.store(on, { settings: { recall: true, writeGate: mode } });
	on("session.start", (_$, e) => ({ cwd: e.cwd }));
	on("command.register", () => ({ value: { command: "uma" } }));
	on("session.cwd", () => ({ value: "/w" }));
	on("session.id", () => ({ value: "s1" }));
	on("ui.status", () => ({ value: undefined }));
	on("fs.exists", () => ({ value: false }));
	on("fs.stat", (_$, e) => ({ value: stat(e.path) }) as never);
	on("ui.log", () => ({ value: undefined }));
	const seen: { questions: string[]; ran: string[] } = { questions: [], ran: [] };
	on("tool.call", { tool: "AskUserQuestion" }, (_$, e) => {
		const q = e.questions[0];
		seen.questions.push(q?.question ?? "");
		if (answer === "no-ui") throw new Error("no one to ask");
		return { result: { questions: e.questions, answers: { [q?.question ?? ""]: answer } } } as never;
	});
	on("tool.call", (_$, e) => {
		seen.ran.push(e.tool);
		return { result: "ran" } as never;
	});
	return seen;
}

async function start($: { session: { start: (a: never) => Promise<unknown> } }) {
	await $.session.start({ cwd: "/w", surface: "terminal", isInteractive: true } as never);
}

test("uma_write: the dialog shows type, title, scope and a clipped body; ✅ Zapsat lets it through", async ($, on) => {
	const seen = setup(on, "ask", "✅ Zapsat");
	await start($);
	const body = "x".repeat(2000);
	const r = await $.tool.call({ tool: WRITE, title: "Použít VSA", type: "decision", scope: "project", body } as never);
	expect(r.deny).toBeUndefined();
	expect(seen.ran).toContain(WRITE);
	const shown = seen.questions[0] ?? "";
	expect(shown).toMatch(/📌 Typ +decision/);
	expect(shown).toMatch(/🔖 Titulek +Použít VSA/);
	expect(shown).toMatch(/📂 Scope +project/);
	expect(shown).toContain("(+1400 znaků)");
	expect(shown.length).toBeLessThan(900);
});

test("uma_write: Zamítnout is a deny for the model and nothing runs", async ($, on) => {
	const seen = setup(on, "ask", "❌ Zamítnout");
	await start($);
	const r = await $.tool.call({ tool: WRITE, title: "t", body: "b" } as never);
	expect(r.deny).toContain("zamítl");
	expect(seen.ran).not.toContain(WRITE);
});

test("uma_write: text typed under Other goes to the model as the reason", async ($, on) => {
	setup(on, "ask", "radši to zapiš jako preferenci");
	await start($);
	const r = await $.tool.call({ tool: WRITE, title: "t", body: "b" } as never);
	expect(r.deny).toContain("radši to zapiš jako preferenci");
});

test("uma_write without a way to ask is denied", async ($, on) => {
	const seen = setup(on, "ask", "no-ui");
	await start($);
	const r = await $.tool.call({ tool: WRITE, title: "t", body: "b" } as never);
	expect(r.deny).toContain("nelze se zeptat");
	expect(seen.ran).not.toContain(WRITE);
});

test("uma_supersede: the dialog shows the replaced id", async ($, on) => {
	const seen = setup(on, "ask", "✅ Zapsat");
	await start($);
	const r = await $.tool.call({ tool: SUPERSEDE, oldId: "01OLD", title: "t", body: "b" } as never);
	expect(r.deny).toBeUndefined();
	expect(seen.questions[0]).toContain("Nahradit fakt 01OLD");
});

test("write-gate off: no dialog for uma_write", async ($, on) => {
	const seen = setup(on, "off", "❌ Zamítnout");
	await start($);
	const r = await $.tool.call({ tool: WRITE, title: "t", body: "b" } as never);
	expect(r.deny).toBeUndefined();
	expect(seen.questions).toEqual([]);
});

async function filesAreGuarded($: Parameters<typeof start>[0] & { tool: { call: (i: never) => Promise<{ deny?: string }> } }, seen: { ran: string[] }) {
	const w = await $.tool.call({ tool: "Write", file_path: "/w/.uma/decision/01X.md", content: "x" } as never);
	expect(w.deny).toContain("uma_write");
	const e = await $.tool.call({ tool: "Edit", file_path: "/home/u/.local/share/uma/global/fact/01.md", old_string: "a", new_string: "b" } as never);
	expect(e.deny).toContain("uma_write");
	const n = await $.tool.call({ tool: "NotebookEdit", notebook_path: "/w/.uma/n.ipynb", new_source: "x" } as never);
	expect(n.deny).toContain("uma_write");
	const ok = await $.tool.call({ tool: "Write", file_path: "/w/src/app.ts", content: "x" } as never);
	expect(ok.deny).toBeUndefined();
	expect(seen.ran).toEqual(["Write"]);
}

test("Write, Edit and NotebookEdit into the store are denied (ask); other files pass", async ($, on) => {
	const seen = setup(on, "ask", "✅ Zapsat");
	await start($);
	await filesAreGuarded($ as never, seen);
});

test("Write, Edit and NotebookEdit into the store are denied also with the gate off", async ($, on) => {
	const seen = setup(on, "off", "✅ Zapsat");
	await start($);
	await filesAreGuarded($ as never, seen);
});

test("a symlink into the store is denied through fs.stat realPath", async ($, on) => {
	setup(on, "ask", "✅ Zapsat", (path) => {
		if (path.replace(/\/$/, "") === "/w/m") return { kind: "dir", size: 0, mtimeMs: 0, isLink: true, realPath: "/w/.uma/decision" };
		throw new Error("ENOENT");
	});
	await start($);
	const r = await $.tool.call({ tool: "Write", file_path: "/w/m/x.md", content: "x" });
	expect(r.deny).toContain("uma_write");
});

test("Bash that would change memory: same dialog with the command; reads and other commands pass", async ($, on) => {
	const seen = setup(on, "ask", "🚀 Spustit");
	await start($);
	const r = await $.tool.call({ tool: "Bash", command: "uma write --title x --body y" });
	expect(r.deny).toBeUndefined();
	expect(seen.questions[0]).toContain("uma write --title x --body y");

	const asked = seen.questions.length;
	await $.tool.call({ tool: "Bash", command: "uma search leaf" });
	await $.tool.call({ tool: "Bash", command: "ls .uma/ 2>/dev/null" });
	expect(seen.questions.length).toBe(asked);
});

test("Bash that would change memory: Zamítnout denies; off lets it run", async ($, on) => {
	setup(on, "ask", "❌ Zamítnout");
	await start($);
	const denied = await $.tool.call({ tool: "Bash", command: "echo hi > .uma/x.md" });
	expect(denied.deny).toContain("zamítl");
});

test("Bash that would change memory with the gate off runs without a dialog", async ($, on) => {
	const seen = setup(on, "off", "❌ Zamítnout");
	await start($);
	const r = await $.tool.call({ tool: "Bash", command: "uma write --title x --body y" });
	expect(r.deny).toBeUndefined();
	expect(seen.questions).toEqual([]);
});
