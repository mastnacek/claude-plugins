// rules through the engine: prompt.compose with a faked `uma`.

import { expect, mock, test } from "claude-code/testing";
import type { On } from "claude-code";

type Run = { exitCode: number; stdout: string; stderr: string } | "missing";

const fact = (type: string, title: string, body: string) => ({ id: title, title, fact_type: type, body });
const ok = (facts: unknown[]): Run => ({ exitCode: 0, stdout: JSON.stringify(facts), stderr: "" });

/** `answers` maps the `--type` value to the run; returns what was run, which cwd and timeout, and what was logged. */
function setup(on: On, answers: Record<string, Run>, settings = { recall: true, writeGate: "ask", append: true }, session = "s1") {
	mock.store(on, { settings });
	mock.env(on, { HOME: "/home/t" });
	on("session.start", (_$, e) => ({ cwd: e.cwd }));
	on("command.register", () => ({ value: { command: "uma" } }));
	on("ui.status", () => ({ value: undefined }));
	on("fs.exists", () => ({ value: false }));
	on("session.cwd", () => ({ value: "/work/app" }));
	on("session.id", () => ({ value: session }));
	const seen = { argv: [] as string[][], cwd: [] as unknown[], timeout: [] as unknown[], logs: [] as string[] };
	on("process.run", (_$, e) => {
		seen.argv.push([...e.argv]);
		seen.cwd.push(e.init?.cwd);
		seen.timeout.push(e.init?.timeoutMs);
		const run = answers[e.argv[e.argv.length - 1] as string] ?? ok([]);
		if (run === "missing") throw new Error("spawn uma ENOENT");
		return { value: { ...run, isStdoutTruncated: false, isStderrTruncated: false } } as never;
	});
	on("ui.log", (_$, e) => {
		seen.logs.push(e.text);
		return { value: undefined };
	});
	// The engine's own composition, beneath the plugin.
	on("prompt.compose", () => ({ sections: [{ id: "intro", text: "You are Claude.", scope: "shared" }] }));
	return seen;
}

type Host = { prompt: { compose: (a: never) => Promise<{ sections: ReadonlyArray<{ id: string; text: string; scope: string }> }> }; session: { start: (a: never) => Promise<unknown> } };
const started = new WeakSet<object>();
async function compose($: Host) {
	if (!started.has($)) {
		started.add($);
		await $.session.start({ cwd: "/work/app", surface: "terminal", isInteractive: true } as never);
	}
	return $.prompt.compose({ model: "m", promptModel: "m", surfaces: [], tools: [], outputStyle: null, traits: [] } as never);
}

test("active decisions and patterns become one session section after the engine's, text as in pi", async ($, on) => {
	const seen = setup(on, {
		decision: ok([fact("decision", "Use VSA", "Slices own code.\nmore")]),
		pattern: ok([fact("pattern", "Deep modules", "Small interface.")]),
	});
	const { sections } = await compose($);
	expect(sections.map((s) => s.id)).toEqual(["intro", "cc-uma-memory:rules"]);
	const rules = sections[1]!;
	expect(rules.scope).toBe("session");
	expect(rules.text).toBe(
		[
			"## Project Memory & Architectural Rules (from UMA)",
			"Strictly follow these recorded decisions and patterns when implementing solutions:",
			"- [decision] Use VSA: Slices own code.",
			"- [pattern] Deep modules: Small interface.",
		].join("\n"),
	);
	expect(seen.argv).toEqual([
		["uma", "list", "--json", "--type", "decision"],
		["uma", "list", "--json", "--type", "pattern"],
	]);
	expect(seen.cwd).toEqual(["/work/app", "/work/app"]);
	expect(seen.timeout).toEqual([5000, 5000]);
});

test("the text is fetched once per session, not for every request", async ($, on) => {
	const seen = setup(on, { decision: ok([fact("decision", "A", "b")]) });
	await compose($);
	const again = await compose($);
	expect(again.sections).toHaveLength(2);
	expect(seen.argv).toHaveLength(2);
});

test("no rules → no section (and no refetch)", async ($, on) => {
	const seen = setup(on, {});
	expect((await compose($)).sections.map((s) => s.id)).toEqual(["intro"]);
	await compose($);
	expect(seen.argv).toHaveLength(2);
});

test("/uma append off → no section and no process", async ($, on) => {
	const seen = setup(on, { decision: ok([fact("decision", "A", "b")]) }, { recall: true, writeGate: "ask", append: false });
	expect((await compose($)).sections.map((s) => s.id)).toEqual(["intro"]);
	expect(seen.argv).toEqual([]);
});

test("missing binary → no section, one log line per series, retried next request", async ($, on) => {
	const seen = setup(on, { decision: "missing", pattern: "missing" });
	expect((await compose($)).sections.map((s) => s.id)).toEqual(["intro"]);
	await compose($);
	expect(seen.logs).toHaveLength(1);
	expect(seen.logs[0]).toContain("pravidla UMA přeskočena");
	expect(seen.argv.length).toBeGreaterThan(2);
});

test("non-zero exit or unreadable output → no section", async ($, on) => {
	setup(on, { decision: { exitCode: 2, stdout: "", stderr: "boom\nmore" }, pattern: ok([fact("pattern", "A", "b")]) });
	expect((await compose($)).sections.map((s) => s.id)).toEqual(["intro"]);
});

test("unreadable JSON → no section", async ($, on) => {
	const seen = setup(on, { decision: { exitCode: 0, stdout: "nope", stderr: "" } });
	expect((await compose($)).sections.map((s) => s.id)).toEqual(["intro"]);
	expect(seen.logs[0]).toContain("nečitelnou");
});
