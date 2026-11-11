// shadow through the engine: Bash results, manifest edits and prompts → `uma staging distill`.

import { expect, mock, test } from "claude-code/testing";
import type { On } from "claude-code";

type Opts = { missing?: boolean; shadow?: "off" | "on" | "jev"; messages?: Array<{ role: "user" | "assistant"; text: string }>; bash?: (command: string) => Record<string, unknown> };

function setup(on: On, o: Opts = {}) {
	const store = new Map<string, unknown>([["settings", { recall: false, writeGate: "off", append: false, immune: "off", immuneModel: "", humility: false, shadow: o.shadow ?? "on" }]]);
	on("store.get", (_$, e) => ({ value: store.get(e.key) }));
	on("store.set", (_$, e) => ({ value: void store.set(e.key, e.value) }));
	mock.env(on, { HOME: "/h" });
	const clock = mock.clock(on);
	on("session.start", (_$, e) => ({ cwd: e.cwd }));
	on("session.cwd", () => ({ value: "/w" }));
	on("session.id", () => ({ value: "s1" }));
	on("session.messages", () => ({ value: (o.messages ?? [{ role: "user", text: "hi" }, { role: "assistant", text: "ok" }]).map((m) => ({ ...m, toolUses: [] })) }) as never);
	on("command.register", () => ({ value: { command: "uma" } }));
	on("ui.status", () => ({ value: undefined }));
	on("ui.log", () => ({ value: undefined }));
	on("fs.list", () => {
		throw new Error("ENOENT");
	});
	on("fs.exists", () => ({ value: false }));
	const argv: string[][] = [];
	on("process.run", (_$, e) => {
		argv.push([...e.argv]);
		if (o.missing) throw new Error("spawn uma ENOENT");
		return { value: { exitCode: 0, stdout: '{"id":"01X"}', stderr: "", isStdoutTruncated: false, isStderrTruncated: false } } as never;
	});
	on("prompt.submit", (_$, e) => ({ text: e.text }) as never);
	on("tool.call", (_$, e) => {
		if (e.tool === "Bash") return (o.bash ?? (() => ({ result: { stdout: "ok", stderr: "" }, text: "ok" })))(String(e.command)) as never;
		return { result: "ran" } as never;
	});
	return { argv, clock, store };
}

type Host = { tool: { call: (a: never) => Promise<unknown> }; session: { start: (a: never) => Promise<unknown> }; prompt: { submit: (a: never) => Promise<unknown> } };
const start = ($: Host) => $.session.start({ cwd: "/w", surface: "terminal", isInteractive: true } as never);
const bash = ($: Host, command: string) => $.tool.call({ tool: "Bash", command } as never);
const prompt = ($: Host, text: string) => $.prompt.submit({ text, origin: { kind: "composer" } } as never);
const distills = (argv: string[][]) => argv.filter((a) => a[1] === "staging");

const RED = (c: string) => (c.startsWith("cargo test") ? { isError: true, result: "boom", text: "Exit code 101\nerror[E0432]: unresolved import" } : { result: { stdout: "ok", stderr: "" }, text: "ok" });
let greenNow = false;
const REDGREEN = (c: string) => (greenNow ? { result: { stdout: "ok", stderr: "" }, text: "test result: ok. 3 passed; 0 failed" } : RED(c));

test("a red cargo test followed by a green one stages a compiler_recovery draft, judge off", async ($, on) => {
	greenNow = false;
	const { argv, clock } = setup(on, { bash: REDGREEN });
	await start($);
	await bash($, "cargo test");
	await clock.advance(1);
	expect(distills(argv)).toEqual([]);
	await $.tool.call({ tool: "Edit", file_path: "/w/src/main.rs", old_string: "a", new_string: "b" } as never);
	greenNow = true;
	await bash($, "cargo test");
	await clock.advance(1);
	const [run] = distills(argv);
	expect(run?.slice(0, 5)).toEqual(["uma", "staging", "distill", "--trigger", "compiler_recovery"]);
	expect(run?.[6]).toContain("`cargo test` initially failed:\nExit code 101");
	expect(run?.[6]).toContain("Fixed by changing: /w/src/main.rs.");
	expect(run).toContain("off");
	// The failure was spent: another green run is not a recovery.
	await bash($, "cargo test");
	await clock.advance(1);
	expect(distills(argv)).toHaveLength(1);
});

test("a recovery after changing only test files (Edit or sed -i) stages nothing", async ($, on) => {
	greenNow = false;
	const { argv, clock } = setup(on, { bash: (c) => (c.startsWith("sed") ? { result: { stdout: "", stderr: "" }, text: "" } : REDGREEN(c)) });
	await start($);
	await bash($, "cargo test");
	await $.tool.call({ tool: "Edit", file_path: "/w/src/a.test.ts", old_string: "a", new_string: "b" } as never);
	await bash($, "sed -i 's/a/b/' tests/b.rs");
	greenNow = true;
	await bash($, "cargo test");
	await clock.advance(1);
	expect(distills(argv)).toEqual([]);
});

test("today's pasted instruction is not a correction", async ($, on) => {
	const { argv, clock } = setup(on);
	await start($);
	await prompt($, "Enable uma memory globally instead of claude memory; there is an uma command for this.");
	await clock.advance(1);
	expect(distills(argv)).toEqual([]);
});

test("jev mode asks the judge", async ($, on) => {
	greenNow = false;
	const { argv, clock } = setup(on, { shadow: "jev", bash: REDGREEN });
	await start($);
	await bash($, "cargo test");
	await $.tool.call({ tool: "Edit", file_path: "/w/src/main.rs", old_string: "a", new_string: "b" } as never);
	greenNow = true;
	await bash($, "cargo test");
	await clock.advance(1);
	expect(distills(argv)[0]).toContain("jev");
});

test("shadow off: nothing is staged by any detector", async ($, on) => {
	greenNow = false;
	const { argv, clock } = setup(on, { shadow: "off", bash: REDGREEN });
	await start($);
	await bash($, "cargo test");
	greenNow = true;
	await bash($, "cargo test");
	await $.tool.call({ tool: "Edit", file_path: "/w/package.json", old_string: "a", new_string: '"left-pad": "1"' } as never);
	await prompt($, "To je špatně, nepoužívej var");
	await clock.advance(1);
	expect(distills(argv)).toEqual([]);
});

test("a dependency change in a manifest stages a dependency_change draft; other files do not", async ($, on) => {
	const { argv, clock } = setup(on);
	await start($);
	await $.tool.call({ tool: "Edit", file_path: "/w/src/main.rs", old_string: "a", new_string: "dependencies" } as never);
	await $.tool.call({ tool: "Write", file_path: "/w/Cargo.toml", content: '[dependencies]\nserde = "1"' } as never);
	await clock.advance(1);
	const runs = distills(argv);
	expect(runs).toHaveLength(1);
	expect(runs[0]?.slice(3, 5)).toEqual(["--trigger", "dependency_change"]);
	expect(runs[0]?.[6]).toContain("File: /w/Cargo.toml");
});

test("the person's correction stages a user_correction draft once; commands, first prompts and tasks do not", async ($, on) => {
	const { argv, clock } = setup(on);
	await start($);
	await prompt($, "Takhle ne, nepoužívej var, jen const");
	await prompt($, "Takhle ne, nepoužívej var, jen const");
	await prompt($, "/review špatně");
	await prompt($, "Zavolej uma_write a nikdy nepoužívej nic jiného");
	await clock.advance(1);
	const runs = distills(argv);
	expect(runs).toHaveLength(1);
	expect(runs[0]?.slice(3, 7)).toEqual(["--trigger", "user_correction", "--context", "Takhle ne, nepoužívej var, jen const"]);
});

test("a correction with no assistant reply before it is not one", async ($, on) => {
	const { argv, clock } = setup(on, { messages: [] });
	await start($);
	await prompt($, "To je špatně");
	await clock.advance(1);
	expect(distills(argv)).toEqual([]);
});

test("a tool result is passed on unchanged, also when uma is missing", async ($, on) => {
	greenNow = false;
	const { clock } = setup(on, { bash: REDGREEN, missing: true });
	await start($);
	const red = (await bash($, "cargo test")) as { isError?: boolean };
	expect(red.isError).toBe(true);
	await $.tool.call({ tool: "Edit", file_path: "/w/src/main.rs", old_string: "a", new_string: "b" } as never);
	greenNow = true;
	await bash($, "cargo test");
	await clock.advance(1);
});
