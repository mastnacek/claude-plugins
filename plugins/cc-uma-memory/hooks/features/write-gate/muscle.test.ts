// The routine gate through the engine: the hook's own dry-run (mock `process.run`),
// the dialog with the steps, the fingerprint check.

import { expect, mock, test } from "claude-code/testing";
import type { On } from "claude-code";

const HASH = "2fc681fefc60aaa3";
const REPORT = JSON.stringify({
	routine: "demo",
	plan_hash: HASH,
	fact_id: "01M7434EVHWG26SCCD4JE2MWDG",
	plan: [
		{ command: "echo", args: ["ahoj"] },
		{ command: "echo", args: ["svet", "1"] },
	],
});

type Dry = { exitCode: number; stdout: string; stderr: string } | "missing";

function setup(on: On, mode: "ask" | "off", answer: string | "no-ui", dry: Dry = { exitCode: 0, stdout: REPORT, stderr: "" }) {
	mock.store(on, { settings: { recall: true, writeGate: mode } });
	on("session.start", (_$, e) => ({ cwd: e.cwd }));
	on("command.register", () => ({ value: { command: "uma" } }));
	on("session.cwd", () => ({ value: "/w" }));
	on("session.id", () => ({ value: "s1" }));
	on("ui.status", () => ({ value: undefined }));
	on("fs.exists", () => ({ value: false }));
	on("ui.log", () => ({ value: undefined }));
	const seen = { questions: [] as string[], options: [] as string[][], headers: [] as string[], argv: [] as string[][], cwd: [] as unknown[], timeout: [] as unknown[], ran: [] as string[] };
	on("process.run", (_$, e) => {
		seen.argv.push([...e.argv]);
		seen.cwd.push(e.init?.cwd);
		seen.timeout.push(e.init?.timeoutMs);
		if (dry === "missing") throw new Error("spawn uma ENOENT");
		return { value: { ...dry, isStdoutTruncated: false, isStderrTruncated: false } } as never;
	});
	on("tool.call", { tool: "AskUserQuestion" }, (_$, e) => {
		const q = e.questions[0];
		seen.questions.push(q?.question ?? "");
		seen.options.push((q?.options ?? []).map((o: { label: string }) => o.label));
		seen.headers.push(q?.header ?? "");
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

const YES = "Ano, pokračovat";
const NO = "Ne, zablokovat";
const run = (command: string) => ({ tool: "Bash", command }) as never;
const GOOD = `uma muscle run demo --confirm --plan-hash ${HASH}`;

test("dialog shows the steps from the dry-run, name, fact ID and fingerprint; Ano passes", async ($, on) => {
	const seen = setup(on, "ask", YES);
	await start($);
	const r = await $.tool.call(run(GOOD));
	expect(r.deny).toBeUndefined();
	expect(seen.ran).toContain("Bash");
	expect(seen.argv).toEqual([["uma", "muscle", "run", "demo", "--json"]]);
	expect(seen.cwd).toEqual(["/w"]);
	expect(typeof seen.timeout[0]).toBe("number");
	expect(seen.options[0]).toEqual([YES, NO]);
	const q = seen.questions[0] ?? "";
	expect(q).toMatch(/^🛡️ UMA imunitní interceptor\n/);
	expect(q).toContain("„demo“");
	expect(q).toContain("$ echo ahoj");
	expect(q).toContain("$ echo svet 1");
	expect(q).toContain(`Otisk: ${HASH}`);
	expect(q).toContain("01M7434EVHWG26SCCD4JE2MWDG");
	expect(q).toContain("Spustit rutinu?");
});

test("Ne denies and the command does not run", async ($, on) => {
	const seen = setup(on, "ask", NO);
	await start($);
	const r = await $.tool.call(run(GOOD));
	expect(r.deny).toContain("rutiny");
	expect(seen.ran).not.toContain("Bash");
});

test("--plan-hash=<h> form is accepted", async ($, on) => {
	const seen = setup(on, "ask", YES);
	await start($);
	const r = await $.tool.call(run(`uma muscle run demo --confirm --plan-hash=${HASH}`));
	expect(r.deny).toBeUndefined();
	expect(seen.questions).toHaveLength(1);
});

test("missing fingerprint: deny with the way out, no dry-run, no dialog", async ($, on) => {
	const seen = setup(on, "ask", YES);
	await start($);
	const r = await $.tool.call(run("uma muscle run demo --confirm"));
	expect(r.deny).toContain("--plan-hash");
	expect(r.deny).toContain("uma_muscle");
	expect(seen.questions).toEqual([]);
	expect(seen.argv).toEqual([]);
	expect(seen.ran).not.toContain("Bash");
});

test("wrong fingerprint: deny 'routine changed', no dialog", async ($, on) => {
	const seen = setup(on, "ask", YES);
	await start($);
	const r = await $.tool.call(run("uma muscle run demo --confirm --plan-hash 0000000000000000"));
	expect(r.deny).toContain("změnila");
	expect(seen.questions).toEqual([]);
	expect(seen.ran).not.toContain("Bash");
});

for (const [label, dry] of [
	["nonzero exit", { exitCode: 1, stdout: "", stderr: "Error: no such routine" }],
	["missing binary", "missing"],
	["report without a hash", { exitCode: 0, stdout: '{"routine":"demo","plan":[]}', stderr: "" }],
	["unparsable report", { exitCode: 0, stdout: "not json", stderr: "" }],
] as Array<[string, Dry]>) {
	test(`dry-run failure (${label}) is a deny without a dialog`, async ($, on) => {
		const seen = setup(on, "ask", YES, dry);
		await start($);
		const r = await $.tool.call(run(GOOD));
		expect(r.deny).toContain("Náhled rutiny");
		expect(seen.questions).toEqual([]);
		expect(seen.ran).not.toContain("Bash");
	});
}

test("write-gate off still asks about a routine", async ($, on) => {
	const seen = setup(on, "off", NO);
	await start($);
	const r = await $.tool.call(run(GOOD));
	expect(seen.questions).toHaveLength(1);
	expect(r.deny).toBeDefined();
	expect(seen.ran).not.toContain("Bash");
});

test("write-gate off: Ano passes", async ($, on) => {
	const seen = setup(on, "off", YES);
	await start($);
	expect((await $.tool.call(run(GOOD))).deny).toBeUndefined();
	expect(seen.questions).toHaveLength(1);
});

test("two routines in one command, or a routine plus another memory change: deny, nothing asked", async ($, on) => {
	const seen = setup(on, "ask", YES);
	await start($);
	for (const command of [`uma muscle run a --confirm --plan-hash ${HASH} && uma muscle run b --confirm --plan-hash ${HASH}`, `uma write --title x --body y; ${GOOD}`]) {
		const r = await $.tool.call(run(command));
		expect(r.deny).toContain("jednu rutinu");
	}
	expect(seen.questions).toEqual([]);
	expect(seen.argv).toEqual([]);
	expect(seen.ran).not.toContain("Bash");
});

test("no UI (-p): deny", async ($, on) => {
	const seen = setup(on, "ask", "no-ui");
	await start($);
	const r = await $.tool.call(run(GOOD));
	expect(r.deny).toContain("nelze se zeptat");
	expect(seen.ran).not.toContain("Bash");
});

test("wrappers: bash -c and sudo env are gated like a bare command", async ($, on) => {
	const seen = setup(on, "ask", NO);
	await start($);
	await $.tool.call(run(`bash -c "uma muscle run demo --confirm --plan-hash ${HASH}"`));
	await $.tool.call(run(`sudo env A=1 uma muscle run demo --confirm --plan-hash ${HASH}`));
	expect(seen.questions).toHaveLength(2);
});

test("dry-run of a routine (no --confirm) is not gated", async ($, on) => {
	const seen = setup(on, "ask", NO);
	await start($);
	const r = await $.tool.call(run("uma muscle run demo --json"));
	expect(r.deny).toBeUndefined();
	expect(seen.questions).toEqual([]);
	expect(seen.argv).toEqual([]);
});
