// The /uma command end to end: switches, persistence, help, unknown subcommands.

import { expect, mock, test } from "claude-code/testing";
import type { On } from "claude-code";

/** An in-memory $.store; the map is what "the next session" would find. */
function setup(on: On, stored?: unknown) {
	const store = new Map<string, unknown>(stored === undefined ? [] : [["settings", stored]]);
	on("store.get", (_$, e) => ({ value: store.get(e.key) }));
	on("store.set", (_$, e) => {
		store.set(e.key, JSON.parse(JSON.stringify(e.value)));
		return { value: undefined };
	});
	mock.env(on, { HOME: "/home/t" });
	on("session.start", (_$, e) => ({ cwd: e.cwd }));
	on("session.cwd", () => ({ value: "/work" }));
	on("command.register", () => ({ value: { command: "uma" } }));
	on("ui.status", () => ({ value: undefined }));
	on("ui.log", () => ({ value: undefined }));
	on("fs.exists", () => ({ value: false }));
	return store;
}

const run = ($: { command: { run: (a: never) => Promise<unknown> } }, args: string) =>
	$.command.run({ command: "uma", args, origin: { kind: "composer" }, presentation: { isFullscreen: false, columns: 80 } } as never) as Promise<{ text?: string }>;
const start = ($: { session: { start: (a: never) => Promise<unknown> } }) => $.session.start({ cwd: "/work", surface: "terminal", isInteractive: true } as never);

test("/uma recall off is stored for later sessions and read back at the next start", async ($, on) => {
	const store = setup(on);
	await start($);
	expect((await run($, "recall")).text).toContain("zapnut");
	expect((await run($, "recall off")).text).toContain("vypnut");
	expect(store.get("settings")).toEqual({ recall: false, writeGate: "ask", append: true });
	expect((await run($, "recall")).text).toBe("Recall do promptu: vypnut");
});

test("settings stored by an earlier session are loaded at start", async ($, on) => {
	setup(on, { recall: false, writeGate: "off" });
	await start($);
	expect((await run($, "recall")).text).toContain("vypnut");
	expect((await run($, "write-gate")).text).toContain("bez dotazu");
});

test("/uma write-gate ask|off and a bad argument", async ($, on) => {
	setup(on);
	await start($);
	expect((await run($, "write-gate")).text).toContain("ptát se");
	expect((await run($, "write-gate off")).text).toContain("bez dotazu");
	expect((await run($, "write-gate maybe")).text).toContain("Neznámý argument");
	expect((await run($, "write-gate")).text).toContain("bez dotazu");
});

test("help lists the new subcommands (first line to the model, the rest in the row); an unknown one says so", async ($, on) => {
	setup(on);
	await start($);
	expect((await run($, "help")).text).toBe("/uma — paměť UMA");
	expect((await run($, "")).text).toBe("/uma — paměť UMA");
	expect((await run($, "nesmysl")).text).toContain("Neznámý podpříkaz „nesmysl“");
});

/** Runs /uma with a faked `uma` process; returns the argv/cwd/timeout seen and the commandOutput drawn. */
function withProcess(on: On, result: { exitCode: number; stdout: string; stderr: string } | "missing") {
	const seen = { argv: [] as string[][], cwd: [] as unknown[], timeout: [] as unknown[] };
	on("process.run", (_$, e) => {
		seen.argv.push([...e.argv]);
		seen.cwd.push(e.init?.cwd);
		seen.timeout.push(e.init?.timeoutMs);
		if (result === "missing") throw new Error("spawn uma ENOENT");
		return { value: { ...result, isStdoutTruncated: false, isStderrTruncated: false } } as never;
	});
	return seen;
}

test("/uma append off is stored; /uma list runs uma in the session's cwd, the model gets one summary line", async ($, on) => {
	const store = setup(on);
	const seen = withProcess(on, { exitCode: 0, stdout: "fact A\nfact B\n", stderr: "" });
	await start($);
	expect((await run($, "append off")).text).toContain("vypnuta");
	expect(store.get("settings")).toEqual({ recall: true, writeGate: "ask", append: false });
	const out = await run($, "list global");
	expect(out.text).toBe("Fakta (global): 2 řádků výpisu (ukázán uživateli)");
	expect(seen.argv).toEqual([["uma", "list", "--scope", "global"]]);
	expect(seen.cwd).toEqual(["/work"]);
	expect(seen.timeout).toEqual([30000]);
});

test("a listing reaches the person through CommandOutput (full text under the summary key)", async ($, on) => {
	setup(on);
	withProcess(on, { exitCode: 0, stdout: "fact A\nfact B\n", stderr: "" });
	await start($);
	await run($, "search proč VSA");
	const mounted = await $.ui.mount({ plugin: "cc-uma-memory", surface: "terminal", component: "CommandOutput", props: { command: "uma", isErrored: false, text: "Hledání „proč VSA“: 2 řádků výpisu (ukázán uživateli)" } } as never);
	expect(await mounted.find({ type: "Text", text: /fact B/ })).toBeDefined();
});

test("every query subcommand builds its argv; reindex and export answer one sentence", async ($, on) => {
	setup(on);
	const seen = withProcess(on, { exitCode: 0, stdout: "x\ny", stderr: "" });
	await start($);
	for (const args of ["search dotaz", "read 01ABC", "timeline --id 01ABC --all", "doctor", "reindex", "export --out /tmp/o"]) await run($, args);
	expect(seen.argv).toEqual([
		["uma", "search", "--", "dotaz"],
		["uma", "read", "--", "01ABC"],
		["uma", "timeline", "--id", "01ABC", "--all"],
		["uma", "doctor"],
		["uma", "search", "", "--reindex"],
		["uma", "export", "--okf", "--out", "/tmp/o"],
	]);
	expect((await run($, "reindex")).text).toBe("Index UMA byl přebudován.");
});

test("bad arguments run nothing; a missing binary says how to install uma", async ($, on) => {
	setup(on);
	const seen = withProcess(on, "missing");
	await start($);
	expect((await run($, "export")).text).toContain("Použití");
	expect((await run($, "doctor --confirm")).text).toContain("Použití");
	expect(seen.argv).toEqual([]);
	const text = (await run($, "doctor")).text;
	expect(text).toContain("binárka `uma`");
	expect(text).toContain("github.com/mastnacek/claude-plugins");
});

test("a failing uma is reported with its exit code", async ($, on) => {
	setup(on);
	withProcess(on, { exitCode: 3, stdout: "", stderr: "no such fact\n" });
	await start($);
	expect((await run($, "read 01ABC")).text).toBe("uma read skončila kódem 3: no such fact");
});

const DEBTS = JSON.stringify([
	{ id: "debt-1", sourceAction: "změna API", requiredAction: "upravit volající", blocking: true, origin: "claude-code", createdAt: "2026-11-11T09:12:00Z", settledAt: null },
	{ id: "debt-2", sourceAction: "a", requiredAction: "b", blocking: false, origin: "pi", createdAt: "2026-11-10T08:00:00Z", settledAt: "2026-11-10T09:00:00Z" },
]);

test("/uma debt lists all debts as one summary line for the model and a listing for the person", async ($, on) => {
	setup(on);
	const seen = withProcess(on, { exitCode: 0, stdout: DEBTS, stderr: "" });
	await start($);
	const out = await run($, "debt list");
	expect(out.text).toBe("Dluhy: otevřených 1 (blokujících 1), vyrovnaných 1 (výpis ukázán uživateli)");
	expect(seen.argv[0]).toEqual(["uma", "debt", "list", "--all", "--json"]);
	expect(seen.cwd[0]).toBe("/work");
	const mounted = await $.ui.mount({ plugin: "cc-uma-memory", surface: "terminal", component: "CommandOutput", props: { command: "uma", isErrored: false, text: out.text } } as never);
	expect(await mounted.find({ type: "Text", text: /debt-1 \[BLOKUJÍCÍ\] změna API → upravit volající/ })).toBeDefined();
	expect(await mounted.find({ type: "Text", text: /debt-2 \[✔ vyrovnán 2026-11-10 09:00\]/ })).toBeDefined();
	expect((await run($, "debt")).text).toContain("Dluhy: otevřených 1");
});

test("/uma debt clear runs `uma debt clear` directly (no bash) and relays the engine's line", async ($, on) => {
	setup(on);
	const seen = withProcess(on, { exitCode: 0, stdout: "Cleared 2 debt(s).\n", stderr: "" });
	await start($);
	expect((await run($, "debt clear")).text).toBe("Cleared 2 debt(s).");
	expect(seen.argv[0]).toEqual(["uma", "debt", "clear"]);
});

test("/uma debt: bad argument runs nothing; empty ledger and a failing uma say so", async ($, on) => {
	setup(on);
	const seen = withProcess(on, { exitCode: 0, stdout: "[]", stderr: "" });
	await start($);
	expect((await run($, "debt nic")).text).toBe("Použití: /uma debt [list|clear]");
	// Only the debt slice's label refresh ran (check); neither list nor clear.
	expect(seen.argv.filter((a) => a[2] !== "check")).toEqual([]);
	expect((await run($, "debt list")).text).toBe("Dluhy: žádné");
});

test("/uma debt in a directory without git: the engine's error is reported with the exit code", async ($, on) => {
	setup(on);
	withProcess(on, { exitCode: 1, stdout: "", stderr: "Error: not a git repository" });
	await start($);
	expect((await run($, "debt list")).text).toBe("uma debt skončila kódem 1: Error: not a git repository");
});
