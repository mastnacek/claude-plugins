// recall through the engine: prompt.submit with a faked `uma`.

import { expect, mock, test } from "claude-code/testing";
import type { On } from "claude-code";

type Run = { exitCode: number; stdout: string; stderr: string } | "missing" | "timeout";

const fact = (id: string) => ({ id, title: `Fact ${id}`, fact_type: "decision", scope: { Project: "app" }, snippet: `Snippet ${id}` });
const verdict = (ids: string[], search = true) => JSON.stringify({ search, judged_by: "jev", fact_types: [], recalled: ids.length, facts: ids.map(fact), note: null });

/** `runs` answers successive `uma` calls (the last one repeats); returns what was run, what reached the bottom and what was logged. */
function setup(on: On, runs: Run[], settings = { recall: true, writeGate: "ask" }) {
	mock.store(on, { settings });
	mock.env(on, { HOME: "/home/t" });
	on("session.start", (_$, e) => ({ cwd: e.cwd }));
	on("command.register", () => ({ value: { command: "uma" } }));
	on("ui.status", () => ({ value: undefined }));
	on("fs.exists", () => ({ value: false }));
	on("session.cwd", () => ({ value: "/work/app" }));
	on("session.id", () => ({ value: "s1" }));
	const seen = { argv: [] as string[][], cwd: [] as unknown[], timeout: [] as unknown[], contexts: [] as Array<readonly string[] | undefined>, logs: [] as string[] };
	on("process.run", (_$, e) => {
		seen.argv.push([...e.argv]);
		seen.cwd.push(e.init?.cwd);
		seen.timeout.push(e.init?.timeoutMs);
		const run = runs[Math.min(seen.argv.length - 1, runs.length - 1)] as Run;
		if (run === "missing") throw new Error("spawn uma ENOENT");
		if (run === "timeout") throw new Error("timed out after 3000 ms");
		return { value: { ...run, isStdoutTruncated: false, isStderrTruncated: false } } as never;
	});
	on("ui.log", (_$, e) => {
		seen.logs.push(e.text);
		return { value: undefined };
	});
	on("prompt.submit", (_$, e) => {
		seen.contexts.push(e.context);
		return { text: e.text, context: e.context } as never;
	});
	return seen;
}

type Host = { prompt: { submit: (a: never) => Promise<unknown> }; session: { start: (a: never) => Promise<unknown> } };

/** The first submit also starts the session, as the engine does: the persisted switches load then. */
const started = new WeakSet<object>();
async function submit($: Host, text: string) {
	if (!started.has($)) {
		started.add($);
		await $.session.start({ cwd: "/work/app", surface: "terminal", isInteractive: true } as never);
	}
	return $.prompt.submit({ text, asUser: true } as never);
}

test("a prompt gets the facts as hidden context, runs in the session's cwd with a 3 s timeout, one log line", async ($, on) => {
	const seen = setup(on, [{ exitCode: 0, stdout: verdict(["A", "B"]), stderr: "" }]);
	await submit($, "proč VSA?");
	expect(seen.contexts[0]?.[0]).toContain("- [decision] Fact A (project:app): Snippet A");
	expect(seen.contexts[0]?.[0]).toContain("Fact B");
	expect(seen.cwd).toEqual(["/work/app"]);
	expect(seen.timeout).toEqual([3000]);
	expect(seen.argv[0]?.slice(0, 8)).toEqual(["uma", "recall", "check", "--judge", "jev", "--json", "--max", "3"]);
	expect(seen.logs).toEqual(["🧠 recall: 2 fakta"]);
});

test("anti-echo: the next prompt sends the inserted ids as --exclude and filters them again", async ($, on) => {
	const seen = setup(on, [
		{ exitCode: 0, stdout: verdict(["A", "B"]), stderr: "" },
		{ exitCode: 0, stdout: verdict(["A", "C"]), stderr: "" }, // an engine that ignored --exclude
	]);
	await submit($, "první");
	await submit($, "druhý");
	expect(seen.argv[1]).toContain("--exclude");
	expect(seen.argv[1]?.filter((a, i) => seen.argv[1]?.[i - 1] === "--exclude")).toEqual(["A", "B"]);
	const second = seen.contexts[1]?.[0] ?? "";
	expect(second).toContain("Fact C");
	expect(second).not.toContain("Fact A");
	expect(seen.logs).toEqual(["🧠 recall: 2 fakta", "🧠 recall: 1 faktum"]);
});

test("no trigger or nothing new: the prompt passes silently", async ($, on) => {
	const seen = setup(on, [{ exitCode: 0, stdout: verdict([], false), stderr: "" }]);
	await submit($, "díky, commitni to");
	expect(seen.contexts).toEqual([undefined]);
	expect(seen.logs).toEqual([]);
});

test("missing binary: the prompt is unchanged, one log line per series of failures", async ($, on) => {
	const seen = setup(on, ["missing"]);
	await submit($, "a");
	await submit($, "b");
	await submit($, "c");
	expect(seen.contexts).toEqual([undefined, undefined, undefined]);
	expect(seen.logs.length).toBe(1);
	expect(seen.logs[0]).toContain("recall přeskočen");
});

test("a failure after a success is reported again; a timeout and a non-zero exit pass the prompt too", async ($, on) => {
	const seen = setup(on, [
		"timeout",
		{ exitCode: 0, stdout: verdict(["A"]), stderr: "" },
		{ exitCode: 2, stdout: "", stderr: "boom\nmore" },
		{ exitCode: 0, stdout: "not json", stderr: "" },
	]);
	await submit($, "1");
	await submit($, "2");
	await submit($, "3");
	await submit($, "4");
	expect(seen.contexts.map((c) => c !== undefined)).toEqual([false, true, false, false]);
	expect(seen.logs.length).toBe(3);
	expect(seen.logs[0]).toContain("recall přeskočen:");
	expect(seen.logs.slice(1)).toEqual(["🧠 recall: 1 faktum", "recall přeskočen: boom"]);
});

test("recall off, commands and empty prompts never call uma", async ($, on) => {
	const seen = setup(on, [{ exitCode: 0, stdout: verdict(["A"]), stderr: "" }], { recall: false, writeGate: "ask" });
	await submit($, "proč VSA?");
	expect(seen.argv).toEqual([]);
});

test("a slash-led prompt is not recalled for", async ($, on) => {
	const seen = setup(on, [{ exitCode: 0, stdout: verdict(["A"]), stderr: "" }]);
	await submit($, "/clear");
	await submit($, "   ");
	expect(seen.argv).toEqual([]);
});
