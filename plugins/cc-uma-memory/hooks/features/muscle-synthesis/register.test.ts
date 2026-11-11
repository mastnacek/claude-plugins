// muscle-synthesis through the engine: a repeated command sequence → one draft, never `uma muscle new`.

import { expect, mock, test } from "claude-code/testing";
import type { On } from "claude-code";

function setup(on: On, o: { shadow?: "off" | "on"; exitCode?: number } = {}) {
	const store = new Map<string, unknown>([["settings", { recall: false, writeGate: "off", append: false, immune: "off", immuneModel: "", humility: false, shadow: o.shadow ?? "on" }]]);
	on("store.get", (_$, e) => ({ value: store.get(e.key) }));
	on("store.set", (_$, e) => ({ value: void store.set(e.key, e.value) }));
	mock.env(on, { HOME: "/h" });
	on("session.start", (_$, e) => ({ cwd: e.cwd }));
	on("session.cwd", () => ({ value: "/w" }));
	on("command.register", () => ({ value: { command: "uma" } }));
	on("ui.status", () => ({ value: undefined }));
	on("fs.list", () => {
		throw new Error("ENOENT");
	});
	on("fs.exists", () => ({ value: false }));
	const seen = { argv: [] as string[][], logs: [] as string[], failing: new Set<string>() };
	on("ui.log", (_$, e) => ({ value: void seen.logs.push(e.text) }));
	on("process.run", (_$, e) => {
		seen.argv.push([...e.argv]);
		return { value: { exitCode: o.exitCode ?? 0, stdout: "", stderr: "", isStdoutTruncated: false, isStderrTruncated: false } } as never;
	});
	on("tool.call", (_$, e) => (seen.failing.has(String((e as { command?: unknown }).command)) ? ({ isError: true, result: "x", text: "Exit code 1" } as never) : ({ result: { stdout: "", stderr: "" }, text: "" } as never)));
	return seen;
}

type Host = { tool: { call: (a: never) => Promise<unknown> }; session: { start: (a: never) => Promise<unknown> } };
const start = ($: Host) => $.session.start({ cwd: "/w", surface: "terminal", isInteractive: true } as never);
const bash = async ($: Host, ...commands: string[]) => {
	for (const command of commands) await $.tool.call({ tool: "Bash", command } as never);
};
const SEQ = ["cargo fmt --all", "cargo clippy -- -D warnings", "cargo test -p core"];
const creates = (argv: string[][]) => argv.filter((a) => a[1] === "staging");

test("the second run of a 3-command sequence stages one routine draft (uma staging create), once per sequence", async ($, on) => {
	const seen = setup(on);
	await start($);
	await bash($, ...SEQ);
	expect(creates(seen.argv)).toEqual([]);
	await bash($, ...SEQ);
	const [run] = creates(seen.argv);
	expect(run?.slice(0, 7)).toEqual(["uma", "staging", "create", "--type", "skill", "--title", "muscle:cargo-fmt-clippy"]);
	expect(run?.[run.indexOf("--trigger") + 1]).toBe("muscle_synthesis");
	expect(JSON.parse(run?.[run.indexOf("--template") + 1] ?? "[]")).toHaveLength(3);
	expect(seen.logs[0]).toContain("cargo-fmt-clippy");
	await bash($, ...SEQ, ...SEQ);
	expect(creates(seen.argv)).toHaveLength(1);
	expect(seen.argv.some((a) => a[1] === "muscle")).toBe(false);
});

test("a failed command does not join the history", async ($, on) => {
	const seen = setup(on);
	seen.failing.add("cargo clippy -- -D warnings");
	await start($);
	await bash($, ...SEQ, ...SEQ);
	expect(creates(seen.argv)).toEqual([]);
});

test("shadow off proposes nothing", async ($, on) => {
	const seen = setup(on, { shadow: "off" });
	await start($);
	await bash($, ...SEQ, ...SEQ);
	expect(creates(seen.argv)).toEqual([]);
});
